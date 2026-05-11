package databricks

import config.DatabricksConfig
import models.*
import service.{DatabricksApiPaths, DatabricksError}
import zio.*
import zio.http.*
import zio.json.*

// Polls Databricks job status until completion
trait JobStatusChecker:
  def waitForCompletion(workspaceUrl: String, token: String, runId: Long): IO[DatabricksError, RunOutput]
  def getTaskRunId(workspaceUrl: String, token: String, runId: Long): IO[DatabricksError, Long]

case class JobStatusCheckerLive(config: DatabricksConfig, client: Client, retryPolicy: RetryPolicy)
    extends JobStatusChecker:

  private val TerminatedState    = "TERMINATED"
  private val InternalErrorState = "INTERNAL_ERROR"
  private val SkippedState       = "SKIPPED"
  private val UnknownState       = "UNKNOWN"

  override def waitForCompletion(workspaceUrl: String, token: String, runId: Long): IO[DatabricksError, RunOutput] =
    val apiUrl       = DatabricksApiPaths.buildGetRunUrl(workspaceUrl, runId)
    val maxAttempts  = config.maxPollAttempts
    val pollInterval = retryPolicy.pollInterval(config.pollIntervalSeconds)

    def checkStatus(): IO[DatabricksError, Option[RunOutput]] =
      ZIO
        .scoped {
          for
            response       <- client.request(Request.get(apiUrl).addHeader("Authorization", s"Bearer $token"))
            jsonStr        <- response.body.asString
            _              <- ZIO
                                .fail(new RuntimeException(s"Status check failed: HTTP ${response.status.code}"))
                                .unless(response.status.isSuccess)
            statusResponse <- ZIO
                                .fromEither(jsonStr.fromJson[RunStatusResponse])
                                .mapError(err => new RuntimeException(s"Failed to parse run status: $err"))
            state           = statusResponse.state.lifeCycleState
            resultState     = statusResponse.state.resultState
            stateMsg        = statusResponse.state.stateMessage.getOrElse("")
            _              <- ZIO.logInfo(
                                s"Run $runId: lifecycle=$state, result=${resultState.getOrElse("N/A")}, msg=$stateMsg"
                              )
            result         <-
              if state == TerminatedState then
                val execSeconds = for
                  start <- statusResponse.startTime
                  end   <- statusResponse.endTime
                  if end > start
                yield (end - start) / 1000L
                ZIO.some(RunOutput(runId, resultState.getOrElse(UnknownState), None, execSeconds))
              else if state == InternalErrorState || state == SkippedState then
                ZIO.fail(DatabricksError.ExecutionFailed(runId, state, statusResponse.state.stateMessage))
              else ZIO.none
          yield result
        }
        .mapError(DatabricksError.fromThrowable)
        .retry(retryPolicy.schedule)
        .tapError(err => ZIO.logWarning(s"Poll attempt failed: ${err.getMessage}"))

    def pollLoop(attempt: Int): IO[DatabricksError, RunOutput] =
      for
        _      <- ZIO.logInfo(s"Poll attempt $attempt/$maxAttempts for run $runId")
        result <- checkStatus()
        output <- result match
                    case Some(out)                      => ZIO.succeed(out)
                    case None if attempt >= maxAttempts =>
                      ZIO.fail(DatabricksError.ExecutionTimeout(runId, maxAttempts, pollInterval.toSeconds.toInt))
                    case None                           => pollLoop(attempt + 1).delay(pollInterval)
      yield output

    ZIO.logInfo(s"Starting poll for run $runId (max $maxAttempts attempts, ${pollInterval.toSeconds}s interval)") *>
      pollLoop(1)

  override def getTaskRunId(workspaceUrl: String, token: String, runId: Long): IO[DatabricksError, Long] =
    val apiUrl = DatabricksApiPaths.buildGetRunUrl(workspaceUrl, runId)

    ZIO
      .scoped {
        for
          response   <- client.request(Request.get(apiUrl).addHeader("Authorization", s"Bearer $token"))
          jsonStr    <- response.body.asString
          _          <- ZIO
                          .fail(new RuntimeException(s"Get task failed: HTTP ${response.status.code}"))
                          .unless(response.status.isSuccess)
          runDetails <- ZIO
                          .fromEither(jsonStr.fromJson[RunDetailsResponse])
                          .mapError(err => new RuntimeException(s"Failed to parse run details: $err"))
          taskRunId  <- runDetails.tasks
                          .flatMap(_.headOption)
                          .map(task => ZIO.succeed(task.runId))
                          .getOrElse(ZIO.fail(new RuntimeException(s"No tasks found in run $runId")))
        yield taskRunId
      }
      .mapError(DatabricksError.fromThrowable)
      .retry(retryPolicy.schedule)
      .tapError(err => ZIO.logWarning(s"Failed to get task run ID: ${err.logMessage}"))

object JobStatusChecker:
  val layer: ZLayer[DatabricksConfig & Client & RetryPolicy, Nothing, JobStatusChecker] =
    ZLayer.fromFunction(JobStatusCheckerLive.apply _)
