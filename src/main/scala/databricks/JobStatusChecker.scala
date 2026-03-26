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
    val pollInterval = retryPolicy.pollInterval(config.pollIntervalSeconds, config.slowDownFactor)

    def checkStatus(): IO[DatabricksError, Option[RunOutput]] =
      ZIO
        .scoped {
          client
            .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer $token"))
            .flatMap { response =>
              response.body.asString.flatMap { jsonStr =>
                if response.status.isSuccess then
                  ZIO
                    .fromEither(jsonStr.fromJson[RunStatusResponse])
                    .mapError(err => new RuntimeException(s"Failed to parse run status: $err"))
                    .flatMap { statusResponse =>
                      val state       = statusResponse.state.lifeCycleState
                      val resultState = statusResponse.state.resultState
                      val stateMsg    = statusResponse.state.stateMessage.getOrElse("")
                      {
                        ZIO
                          .logInfo(
                            s"Run $runId: lifecycle=$state, result=${resultState.getOrElse("N/A")}, msg=$stateMsg"
                          )
                      } *> {
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
                      }
                    }
                else ZIO.fail(new RuntimeException(s"Status check failed: HTTP ${response.status.code}"))
              }
            }
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
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer $token"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              if response.status.isSuccess then
                ZIO
                  .fromEither(jsonStr.fromJson[RunDetailsResponse])
                  .mapError(err => new RuntimeException(s"Failed to parse run details: $err"))
                  .flatMap { runDetails =>
                    runDetails.tasks
                      .flatMap(_.headOption)
                      .map(task => ZIO.succeed(task.runId))
                      .getOrElse(ZIO.fail(new RuntimeException(s"No tasks found in run $runId")))
                  }
              else ZIO.fail(new RuntimeException(s"Get task failed: HTTP ${response.status.code}"))
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)
      .retry(retryPolicy.schedule)
      .tapError(err => ZIO.logWarning(s"Failed to get task run ID: ${err.getMessage}"))

object JobStatusChecker:
  val layer: ZLayer[DatabricksConfig & Client & RetryPolicy, Nothing, JobStatusChecker] =
    ZLayer.fromFunction(JobStatusCheckerLive.apply _)
