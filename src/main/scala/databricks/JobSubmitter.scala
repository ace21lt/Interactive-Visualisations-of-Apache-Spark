package databricks

import config.DatabricksConfig
import models.*
import service.{DatabricksApiPaths, DatabricksError}
import zio.*
import zio.http.*
import zio.json.*

import java.lang.System.currentTimeMillis

// Submits notebook jobs to Databricks
trait JobSubmitter:
  def submitJob(workspaceUrl: String, token: String, notebookPath: String): IO[DatabricksError, Long]

case class JobSubmitterLive(config: DatabricksConfig, client: Client, retryPolicy: RetryPolicy) extends JobSubmitter:

  override def submitJob(workspaceUrl: String, token: String, notebookPath: String): IO[DatabricksError, Long] =
    val apiUrl  = DatabricksApiPaths.buildSubmitUrl(workspaceUrl)
    val runName = s"spark-trace-${currentTimeMillis()}"

    val notebookTask = NotebookTask(notebookPath = notebookPath)
    val task         = TaskSpec(taskKey = "notebook_task", notebookTask = notebookTask)

    val request = NotebookRunRequest(
      runName = runName,
      tasks = Some(List(task)),
      notebookTask = None,
      newCluster = None,
      timeoutSeconds = Some(config.timeoutSeconds),
      format = Some("MULTI_TASK")
    )
    val body    = request.toJson

    (for
      _ <- ZIO.logInfo(s"Submitting to: $apiUrl")
      _ <- ZIO.logInfo(s"Request body: $body")

      runId <- ZIO.scoped {
                 client
                   .request(
                     Request
                       .post(apiUrl, Body.fromString(body))
                       .addHeader("Authorization", s"Bearer $token")
                       .addHeader("Content-Type", "application/json")
                   )
                   .flatMap { response =>
                     response.body.asString.flatMap { jsonStr =>
                       ZIO.logInfo(s"Submit response: HTTP ${response.status.code}") *>
                         (if response.status.isSuccess then
                            ZIO
                              .fromEither(jsonStr.fromJson[SubmitRunResponse])
                              .mapBoth(
                                err => new RuntimeException(s"Failed to parse response: $err"),
                                _.runId
                              )
                          else
                            ZIO.logError(s"Databricks API error - Status: ${response.status.code}") *>
                              ZIO.logError(s"Databricks API error - Response body: $jsonStr") *>
                              ZIO.fail(new RuntimeException(s"Submit failed: HTTP ${response.status.code} - $jsonStr"))
                         )
                     }
                   }
               }
    yield runId)
      .mapError(DatabricksError.fromThrowable)
      .retry(retryPolicy.schedule)
      .tapError(err => ZIO.logError(s"Submit failed after retries: ${err.getMessage}"))

object JobSubmitter:
  val layer: ZLayer[DatabricksConfig & Client & RetryPolicy, Nothing, JobSubmitter] =
    ZLayer.fromFunction(JobSubmitterLive.apply _)
