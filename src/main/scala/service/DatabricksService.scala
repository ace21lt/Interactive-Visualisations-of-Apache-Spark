package service

import config.DatabricksConfig
import models.*
import zio.*
import zio.http.*
import zio.json.*

trait DatabricksService:
  def runNotebook(): Task[RunOutput] // Submits notebook, polls for completion, returns results

object DatabricksService:
  // Helper to access service from ZIO environment
  def runNotebook(): ZIO[DatabricksService, Throwable, RunOutput] =
    ZIO.serviceWithZIO[DatabricksService](_.runNotebook())

case class DatabricksServiceLive(config: DatabricksConfig, client: Client) extends DatabricksService:

  private val TerminatedState = "TERMINATED"
  private val UnknownState    = "UNKNOWN"
  private val TimeoutState    = "TIMEOUT"

  // Runs notebook end-to-end and returns execution trace
  override def runNotebook(): Task[RunOutput] =
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

  private def getTaskRunId(runId: Long): Task[Long] =
    val apiUrl = s"${config.workspaceUrl}/api/2.1/jobs/runs/get?run_id=$runId"

    ZIO.scoped {
      client
        .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
        .flatMap { response =>
          response.body.asString.flatMap { jsonStr =>
            if (response.status.isSuccess) {
              ZIO
                .fromEither(jsonStr.fromJson[RunDetailsResponse])
                .mapBoth(
                  err => new RuntimeException(s"Failed to parse run details: $err"),
                  runDetails =>
                    runDetails.tasks
                      .flatMap(_.headOption)
                      .map(_.runId)
                      .getOrElse(
                        throw new RuntimeException(
                          s"No tasks found in run details for run_id=$runId. Response: $jsonStr"
                        )
                      )
                )
            } else {
              ZIO.fail(new RuntimeException(s"Failed to get run details: $jsonStr"))
            }
          }
        }
    }

  // Submit notebook to Databricks and get run ID
  private def submitNotebook(): Task[Long] =
    val apiUrl  = s"${config.workspaceUrl}/api/2.1/jobs/runs/submit"
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

    for {
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
                                         err => new RuntimeException(s"Failed to parse response: $err"),
                                         _.runId
                                       )
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

  private def pollForCompletion(runId: Long): Task[RunOutput] =
    val apiUrl       = s"${config.workspaceUrl}/api/2.1/jobs/runs/get?run_id=$runId"
    val maxAttempts  = config.maxPollAttempts
    val pollInterval = (config.pollIntervalSeconds * config.slowDownFactor).toInt.seconds

    def checkStatus(attempt: Int): Task[(Int, Option[RunOutput])] =
      ZIO.scoped {
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer ${config.token}"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              if (response.status.isSuccess) {
                ZIO
                  .fromEither(jsonStr.fromJson[RunStatusResponse])
                  .mapBoth(
                    err => new RuntimeException(s"Failed to parse run status: $err"),
                    statusResponse => {
                      val state       = statusResponse.state.lifeCycleState
                      val resultState = statusResponse.state.resultState

                      val output = if (state == TerminatedState) {
                        val notebookOutput = extractNotebookOutput(jsonStr)
                        Some(RunOutput(runId, resultState.getOrElse(UnknownState), Some(notebookOutput)))
                      } else None

                      (attempt + 1, output)
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

    ZIO
      .iterate((0, Option.empty[RunOutput])) { case (currentAttempt, maybeOutput) =>
        currentAttempt < maxAttempts && maybeOutput.isEmpty
      } { case (attempt, _) =>
        checkStatus(attempt).flatMap { result =>
          result._2 match {
            case Some(_)                          => ZIO.succeed(result)
            case None if result._1 >= maxAttempts => ZIO.succeed(result)
            case None                             => ZIO.succeed(result).delay(pollInterval)
          }
        }
      }
      .map { case (_, maybeOutput) =>
        maybeOutput.getOrElse(RunOutput(runId, TimeoutState, None))
      }

  private def extractNotebookOutput(jsonStr: String): NotebookOutput =
    NotebookOutput(
      result = Some(jsonStr)
    )

  // Fetch actual notebook output from task run
  private def fetchNotebookOutput(runId: Long): Task[Option[NotebookOutput]] =
    val apiUrl = s"${config.workspaceUrl}/api/2.1/jobs/runs/get-output?run_id=$runId"

    def extractResultField(json: String): Option[String] =
      val key = "\"result\""
      var idx = json.indexOf(key)
      if idx < 0 then return None

      // Move past the key to the colon
      idx = json.indexOf(':', idx + key.length)
      if idx < 0 then return None

      // Skip whitespace after colon
      var i = idx + 1
      while i < json.length && Character.isWhitespace(json.charAt(i)) do i += 1
      if i >= json.length || json.charAt(i) != '"' then return None

      // Now extract the string value, handling escapes
      val sb      = new StringBuilder
      var j       = i + 1 // Start after opening quote
      var escaped = false
      var closed  = false

      while j < json.length && !closed do
        val ch = json.charAt(j)
        if escaped then
          // Keep the escape sequence for later unescaping
          sb.append('\\').append(ch)
          escaped = false
          j += 1
        else if ch == '\\' then
          escaped = true
          j += 1
        else if ch == '"' then
          closed = true
          j += 1
        else
          sb.append(ch)
          j += 1

      if !closed then return None

      // Now unescape the extracted string
      val raw       = sb.toString
      val unescaped = new StringBuilder(raw.length)
      var k         = 0
      while k < raw.length do
        val c = raw.charAt(k)
        if c == '\\' && k + 1 < raw.length then
          raw.charAt(k + 1) match
            case '"'   => unescaped.append('"'); k += 2
            case '\\'  => unescaped.append('\\'); k += 2
            case 'n'   => unescaped.append('\n'); k += 2
            case 'r'   => unescaped.append('\r'); k += 2
            case 't'   => unescaped.append('\t'); k += 2
            case other => unescaped.append(other); k += 2
        else
          unescaped.append(c); k += 1

      Some(unescaped.toString)

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
                  ZIO.attempt {
                    extractResultField(jsonStr) match
                      case Some(value) =>
                        val trimmed = value.trim
                        Some(NotebookOutput(result = Some(trimmed)))
                      case None        =>
                        Some(NotebookOutput(result = Some(jsonStr)))
                  }
              } else {
                ZIO.logWarning(s"Failed to fetch notebook output (HTTP ${response.status.code}): $jsonStr").as(None)
              }
            }
          }
      }
      .catchAll { error =>
        ZIO.logWarning(s"Error fetching notebook output: ${error.getMessage}").as(None)
      }

object DatabricksServiceLive:
  // ZLayer for dependency injection - requires config and HTTP client
  val layer: ZLayer[DatabricksConfig & Client, Nothing, DatabricksService] =
    ZLayer.fromFunction(DatabricksServiceLive.apply _)
