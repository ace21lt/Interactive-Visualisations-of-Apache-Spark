package service

import config.DatabricksConfig
import models.*
import zio.*
import zio.http.*
import zio.json.*

// Service interface for Databricks notebook execution
trait DatabricksService:
  def runNotebook(): Task[RunOutput] // Submits notebook, polls for completion, returns results

object DatabricksService:
  // Helper to access service from ZIO environment
  def runNotebook(): ZIO[DatabricksService, Throwable, RunOutput] =
    ZIO.serviceWithZIO[DatabricksService](_.runNotebook())

// Live implementation of Databricks service using real HTTP client
case class DatabricksServiceLive(config: DatabricksConfig, client: Client) extends DatabricksService:

  // Lifecycle state constants from Databricks API
  private val TerminatedState = "TERMINATED" // Job finished (success or failure)
  private val UnknownState    = "UNKNOWN"    // Error state if we can't determine status
  private val TimeoutState    = "TIMEOUT"    // We gave up waiting

  // Main entry point: runs notebook end-to-end and returns execution trace
  override def runNotebook(): Task[RunOutput] =
    for {
      _              <- ZIO.logInfo(s"Triggering notebook at ${config.notebookPath}")
      _              <- ZIO.when(config.slowDownFactor != 1.0)(
                          ZIO.logInfo(s"Using slowdown factor: ${config.slowDownFactor}x (poll interval: ${config.pollIntervalSeconds * config.slowDownFactor}s)")
                        )
      runId          <- submitNotebook()               // Step 1: Submit notebook to Databricks
      _              <- ZIO.logInfo(s"Notebook submitted with run ID: $runId")
      status         <- pollForCompletion(runId)       // Step 2: Poll until notebook completes
      _              <- ZIO.logInfo(s"Notebook completed with state: ${status.state}")
      taskRunId      <- getTaskRunId(runId)            // Step 3: Get task run ID (MULTI_TASK format)
      _              <- ZIO.logInfo(s"Task run ID: $taskRunId")
      notebookOutput <- fetchNotebookOutput(taskRunId) // Step 4: Fetch Cell 6 output
      _              <- ZIO.logInfo(s"Retrieved notebook output")
    } yield status.copy(output = notebookOutput) // Combine status + output

  // Extract task run ID from main run (needed for MULTI_TASK format)
  private def getTaskRunId(runId: Long): Task[Long] =
    val apiUrl = s"${config.workspaceUrl}/api/2.1/jobs/runs/get?run_id=$runId"

    ZIO.scoped {
      client
        .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
        .flatMap { response =>
          response.body.asString.flatMap { jsonStr =>
            if (response.status.isSuccess) {
              // Parse JSON to extract task run_id using regex
              ZIO.attempt {
                val taskRunIdPattern = "\"run_id\"\\s*:\\s*(\\d+)".r
                val matches          = taskRunIdPattern.findAllMatchIn(jsonStr).toList
                // First match = main run_id, second match = task run_id
                if (matches.length >= 2) {
                  matches(1).group(1).toLong
                } else {
                  throw new RuntimeException(s"Could not find task run_id in response: $jsonStr")
                }
              }
            } else {
              ZIO.fail(new RuntimeException(s"Failed to get run details: $jsonStr"))
            }
          }
        }
    }

  // Submit notebook to Databricks and get run ID
  private def submitNotebook(): Task[Long] =
    val apiUrl  = s"${config.workspaceUrl}/api/2.1/jobs/runs/submit"
    val runName = s"spark-trace-${java.lang.System.currentTimeMillis()}" // Unique run name

    // Build request for Databricks serverless compute (MULTI_TASK format)
    val notebookTask = NotebookTask(notebookPath = config.notebookPath)
    val task         = TaskSpec(
      taskKey = "notebook_task", // Unique identifier for this task
      notebookTask = notebookTask
    )

    val request = NotebookRunRequest(
      runName = runName,
      tasks = Some(List(task)),   // MULTI_TASK requires tasks array
      notebookTask = None,        // Don't use single task format
      newCluster = None,          // Serverless = no cluster config
      timeoutSeconds = Some(config.timeoutSeconds),
      format = Some("MULTI_TASK") // Required for serverless
    )
    val body    = request.toJson

    for {
      // Log detailed request info for debugging
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
                         // Log response for debugging
                         _ <- ZIO.logInfo(s"=== Databricks API Response ===")
                         _ <- ZIO.logInfo(s"HTTP Status: ${response.status.code}")
                         _ <- ZIO.logInfo(s"Response Body: $jsonStr")
                         _ <- ZIO.logInfo(s"===============================")

                         // Parse response or fail with detailed error
                         result <- if (response.status.isSuccess) {
                                     ZIO
                                       .fromEither(jsonStr.fromJson[SubmitRunResponse])
                                       .mapBoth(
                                         err => new RuntimeException(s"Failed to parse response: $err"),
                                         _.runId
                                       ) // Extract run ID
                                   } else {
                                     ZIO.fail(
                                       new RuntimeException(
                                         s"\n=== Databricks API Error ===\n" +
                                           s"HTTP Status: ${response.status.code}\n" +
                                           s"Error Response: $jsonStr\n" +
                                           s"Request Body Sent:\n$body\n" +
                                           s"==========================="
                                       )
                                     )
                                   }
                       } yield result
                     }
                   }
               }
    } yield runId

  // Poll Databricks API until notebook completes or times out
  private def pollForCompletion(runId: Long): Task[RunOutput] =
    val apiUrl       = s"${config.workspaceUrl}/api/2.1/jobs/runs/get?run_id=$runId"
    val maxAttempts  = config.maxPollAttempts
    // Apply slowdown factor for teaching demos (e.g., 2.0 = half speed, 0.5 = double speed)
    val pollInterval = (config.pollIntervalSeconds * config.slowDownFactor).seconds

    // Check status once and return (attempt, output if completed)
    def checkStatus(attempt: Int): Task[(Int, Option[RunOutput])] =
      ZIO.scoped {
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              // Check HTTP status before parsing
              if (response.status.isSuccess) {
                ZIO
                  .fromEither(jsonStr.fromJson[RunStatusResponse])
                  .mapBoth(
                    err => new RuntimeException(s"Failed to parse run status: $err"),
                    statusResponse => {
                      val state       = statusResponse.state.lifeCycleState
                      val resultState = statusResponse.state.resultState

                      val output = if (state == TerminatedState) {
                        // Notebook finished - extract output
                        val notebookOutput = extractNotebookOutput(jsonStr)
                        Some(RunOutput(runId, resultState.getOrElse(UnknownState), Some(notebookOutput)))
                      } else None // Still running

                      (attempt + 1, output) // Return next attempt number and output (if any)
                    }
                  )
              } else {
                ZIO.fail(
                  new RuntimeException(
                    s"Databricks API polling error (HTTP ${response.status.code}): $jsonStr"
                  )
                )
              }
            }
          }
      }

    // Polling loop: repeat until we get output or hit max attempts
    ZIO
      .iterate((0, Option.empty[RunOutput])) { case (currentAttempt, maybeOutput) =>
        currentAttempt < maxAttempts && maybeOutput.isEmpty // Continue condition
      } { case (attempt, _) =>
        checkStatus(attempt).flatMap { result =>
          result._2 match {
            case Some(_)                          => ZIO.succeed(result)                     // Done - notebook finished
            case None if result._1 >= maxAttempts => ZIO.succeed(result)                     // Done - max attempts reached
            case None                             => ZIO.succeed(result).delay(pollInterval) // Still running - wait before next check
          }
        }
      }
      .map { case (_, maybeOutput) =>
        maybeOutput.getOrElse(RunOutput(runId, TimeoutState, None)) // Return output or timeout
      }

  // Extract notebook output from JSON response
  private def extractNotebookOutput(jsonStr: String): NotebookOutput =
    import zio.json.ast.Json
    // Try to parse the JSON and extract notebook_output.result field
    Json.fromString(jsonStr) match {
      case Left(_) =>
        // Parsing failed, return None
        NotebookOutput(result = None)
      case Right(json) =>
        // Try to find notebook_output.result
        val resultOpt = for {
          notebookOutput <- json.asObject.flatMap(_.get("notebook_output"))
          notebookObj    <- notebookOutput.asObject
          resultValue    <- notebookObj.get("result")
          resultStr      <- resultValue.asString
        } yield resultStr
        NotebookOutput(result = resultOpt)
    }

  // Fetch actual notebook output from task run (Cell 6 dbutils.notebook.exit() value)
  private def fetchNotebookOutput(runId: Long): Task[Option[NotebookOutput]] =
    val apiUrl = s"${config.workspaceUrl}/api/2.1/jobs/runs/get-output?run_id=$runId"

    ZIO
      .scoped {
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              if (response.status.isSuccess) {
                ZIO.logInfo(s"=== Notebook Output API Response ===") *>
                  ZIO.logInfo(s"Response: $jsonStr") *>
                  ZIO.logInfo(s"====================================") *>
                  // Parse to extract notebook_output.result field using zio-json
                  ZIO.attempt {
                    // Define minimal case class for parsing
                    final case class NotebookOutputResponse(notebook_output: Option[NotebookOutputField])
                    final case class NotebookOutputField(result: Option[String])

                    jsonStr.fromJson[NotebookOutputResponse] match {
                      case Right(parsed) =>
                        parsed.notebook_output.flatMap(_.result) match {
                          case Some(resultStr) =>
                            Some(NotebookOutput(result = Some(resultStr)))
                          case None =>
                            // No result field - return full response for debugging
                            Some(NotebookOutput(result = Some(jsonStr)))
                        }
                      case Left(_) =>
                        // Parsing failed - return full response for debugging
                        Some(NotebookOutput(result = Some(jsonStr)))
                    }
                  }
              } else {
                // API error - log warning but don't fail (output is optional)
                ZIO.logWarning(s"Failed to fetch notebook output (HTTP ${response.status.code}): $jsonStr").as(None)
              }
            }
          }
      }
      .catchAll { error =>
        // Exception during fetch - log warning but don't fail
        ZIO.logWarning(s"Error fetching notebook output: ${error.getMessage}").as(None)
      }

object DatabricksServiceLive:
  // ZLayer for dependency injection - requires config and HTTP client
  val layer: ZLayer[DatabricksConfig & Client, Nothing, DatabricksService] =
    ZLayer.fromFunction(DatabricksServiceLive.apply _)
