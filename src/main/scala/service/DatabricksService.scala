package service

import config.DatabricksConfig
import models.*
import zio.*
import zio.http.*
import zio.json.*

trait DatabricksService:
  def runNotebook(): IO[DatabricksError, RunOutput] // Submits notebook, polls for completion, returns results

object DatabricksService:
  // Helper to access service from ZIO environment
  def runNotebook(): ZIO[DatabricksService, DatabricksError, RunOutput] =
    ZIO.serviceWithZIO[DatabricksService](_.runNotebook())

case class DatabricksServiceLive(config: DatabricksConfig, client: Client) extends DatabricksService:

  private val TerminatedState = "TERMINATED"
  private val UnknownState    = "UNKNOWN"
  private val TimeoutState    = "TIMEOUT"

  // Runs notebook end-to-end and returns execution trace
  override def runNotebook(): IO[DatabricksError, RunOutput] =
    for {
      _              <- ZIO.logInfo(s"Triggering notebook at ${config.notebookPath}")
      _              <-
        ZIO.when(config.slowDownFactor != 1.0)(
          ZIO.logInfo(
            s"Using slowdown factor: ${config.slowDownFactor}x (poll interval: ${config.pollIntervalSeconds * config.slowDownFactor}s)"
          )
        )
      runId          <- submitNotebook()
      _              <- ZIO.logInfo(s"Notebook submitted with run ID: $runId")
      status         <- pollForCompletion(runId)
      _              <- ZIO.logInfo(s"Notebook completed with state: ${status.state}")
      taskRunId      <- getTaskRunId(runId)
      _              <- ZIO.logInfo(s"Task run ID: $taskRunId")
      notebookOutput <- fetchNotebookOutput(taskRunId)
      _              <- ZIO.logInfo(s"Retrieved notebook output")
    } yield status.copy(output = notebookOutput)

  private def getTaskRunId(runId: Long): IO[DatabricksError, Long] =
    val apiUrl = DatabricksApiPaths.buildGetRunUrl(config.workspaceUrl, runId)

    ZIO
      .scoped {
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              if (response.status.isSuccess) {
                ZIO
                  .fromEither(jsonStr.fromJson[RunDetailsResponse])
                  .mapError(err => DatabricksError.JsonParseError(s"Failed to parse run details: $err", Some(jsonStr)))
                  .flatMap { runDetails =>
                    runDetails.tasks
                      .flatMap(_.headOption)
                      .map(task => ZIO.succeed(task.runId))
                      .getOrElse(
                        ZIO.fail(
                          DatabricksError.TaskNotFound(runId, s"No tasks found in run details. Response: $jsonStr")
                        )
                      )
                  }
              } else {
                ZIO.fail(DatabricksError.ApiResponseError(response.status.code, jsonStr))
              }
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)

  // Submit notebook to Databricks and get run ID
  private def submitNotebook(): IO[DatabricksError, Long] =
    val apiUrl  = DatabricksApiPaths.buildSubmitUrl(config.workspaceUrl)
    val runName = s"spark-trace-${java.lang.System.currentTimeMillis()}"

    val notebookTask = NotebookTask(notebookPath = config.notebookPath)
    val task         = TaskSpec(
      taskKey = "notebook_task",
      notebookTask = notebookTask
    )

    val request = NotebookRunRequest(
      runName = runName,
      tasks = Some(List(task)),   // MULTI_TASK requires tasks array
      notebookTask = None,
      newCluster = None,
      timeoutSeconds = Some(config.timeoutSeconds),
      format = Some("MULTI_TASK") // Required for serverless
    )
    val body    = request.toJson

    (for {
      _ <- ZIO.logInfo(s"=== Submitting Notebook to Databricks (Serverless) ===")
      _ <- ZIO.logInfo(s"URL: $apiUrl")
      _ <- ZIO.logInfo(s"Run Name: $runName")
      _ <- ZIO.logInfo(s"Notebook Path: ${config.notebookPath}")
      _ <- ZIO.logInfo(s"Compute: Serverless with MULTI_TASK format")
      _ <- ZIO.logInfo(s"Request Body JSON: $body")
      _ <- ZIO.logInfo(s"========================================================")

      runId <- ZIO.scoped {
                 client
                   .request(
                     Request
                       .post(apiUrl, Body.fromString(body))
                       .addHeader("Authorization", s"Bearer ${config.token}")
                       .addHeader("Content-Type", "application/json")
                   )
                   .flatMap { response =>
                     response.body.asString.flatMap { jsonStr =>
                       for {
                         _ <- ZIO.logInfo(s"=== Databricks API Response ===")
                         _ <- ZIO.logInfo(s"HTTP Status: ${response.status.code}")
                         _ <- ZIO.logInfo(s"Response Body: $jsonStr")
                         _ <- ZIO.logInfo(s"===============================")

                         result <- if (response.status.isSuccess) {
                                     ZIO
                                       .fromEither(jsonStr.fromJson[SubmitRunResponse])
                                       .mapBoth(
                                         err =>
                                           DatabricksError
                                             .JsonParseError(s"Failed to parse response: $err", Some(jsonStr)),
                                         _.runId
                                       )
                                   } else {
                                     ZIO.fail(
                                       DatabricksError.ApiResponseError(
                                         response.status.code,
                                         s"Failed to submit notebook: $jsonStr"
                                       )
                                     )
                                   }
                       } yield result
                     }
                   }
               }
    } yield runId).mapError(DatabricksError.fromThrowable)

  private def pollForCompletion(runId: Long): IO[DatabricksError, RunOutput] =
    val apiUrl       = DatabricksApiPaths.buildGetRunUrl(config.workspaceUrl, runId)
    val maxAttempts  = config.maxPollAttempts
    val pollInterval = (config.pollIntervalSeconds * config.slowDownFactor).toInt.seconds

    // Check status once and return Option[RunOutput]
    def checkStatus(): IO[DatabricksError, Option[RunOutput]] =
      ZIO
        .scoped {
          client
            .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
            .flatMap { response =>
              response.body.asString.flatMap { jsonStr =>
                if (response.status.isSuccess) {
                  ZIO
                    .fromEither(jsonStr.fromJson[RunStatusResponse])
                    .mapBoth(
                      err => DatabricksError.JsonParseError(s"Failed to parse run status: $err", Some(jsonStr)),
                      statusResponse => {
                        val state       = statusResponse.state.lifeCycleState
                        val resultState = statusResponse.state.resultState

                        if (state == TerminatedState) {
                          val notebookOutput = extractNotebookOutput(jsonStr)
                          Some(RunOutput(runId, resultState.getOrElse(UnknownState), Some(notebookOutput)))
                        } else {
                          None
                        }
                      }
                    )
                } else {
                  ZIO.fail(DatabricksError.ApiResponseError(response.status.code, jsonStr))
                }
              }
            }
        }
        .mapError(DatabricksError.fromThrowable)

    // Use ZIO Schedule for declarative polling
    // Repeat checkStatus with fixed interval, up to maxAttempts times, until we get Some(output)
    val schedule = Schedule.fixed(pollInterval) *>
      Schedule.recurUntil[Option[RunOutput]](_.isDefined) &&
      Schedule.recurs(maxAttempts - 1)

    checkStatus()
      .repeat(schedule)
      .map(_._1) // Extract the Option[RunOutput] from the tuple
      .flatMap {
        case Some(output) => ZIO.succeed(output)
        case None         =>
          ZIO.fail(DatabricksError.ExecutionTimeout(runId, maxAttempts, pollInterval.toSeconds.toInt))
      }

  private def extractNotebookOutput(jsonStr: String): NotebookOutput =
    NotebookOutput(
      result = Some(jsonStr)
    )

  // Fetch actual notebook output from task run
  // Returns None if output unavailable, fails with DatabricksError for serious errors
  private def fetchNotebookOutput(runId: Long): IO[DatabricksError, Option[NotebookOutput]] =
    val apiUrl = DatabricksApiPaths.buildGetOutputUrl(config.workspaceUrl, runId)

    ZIO
      .scoped {
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              if (response.status.isSuccess) {
                ZIO.logInfo(s"=== Notebook Output API Response ===") *>
                  ZIO.logInfo(s"Response length: ${jsonStr.length} chars") *>
                  ZIO.logInfo(s"====================================") *>
                  ZIO
                    .fromEither(jsonStr.fromJson[NotebookOutputResponse])
                    .map { outputResponse =>
                      // Extract the result from the nested structure
                      val result = outputResponse.metadata
                        .flatMap(_.notebookOutput)
                        .flatMap(_.result)

                      // If we have an error in the response, include it
                      val error = outputResponse.error

                      Some(
                        NotebookOutput(
                          result = result,
                          error = error
                        )
                      )
                    }
                    .catchAll { parseError =>
                      // If parsing fails, fall back to including raw JSON as result
                      ZIO
                        .logWarning(s"Failed to parse notebook output response: $parseError")
                        .as(Some(NotebookOutput(result = Some(jsonStr))))
                    }
              } else {
                // Non-success status is logged and return None
                ZIO.logWarning(s"Failed to fetch notebook output (HTTP ${response.status.code}): $jsonStr").as(None)
              }
            }
          }
      }
      .catchAll { error =>
        // Network errors are logged and then propagated as DatabricksError
        ZIO.logWarning(s"Error fetching notebook output: ${error.getMessage}") *> ZIO.fail(
          DatabricksError.fromThrowable(error)
        )
      }

object DatabricksServiceLive:
  // ZLayer for dependency injection - requires config and HTTP client
  val layer: ZLayer[DatabricksConfig & Client, Nothing, DatabricksService] =
    ZLayer.fromFunction(DatabricksServiceLive.apply _)
