package databricks

import models.NotebookOutput
import service.{DatabricksApiPaths, DatabricksError}
import zio.*
import zio.http.*

// Fetches notebook output from Databricks
trait OutputFetcher:
  def fetchOutput(workspaceUrl: String, token: String, runId: Long): IO[DatabricksError, Option[NotebookOutput]]

case class OutputFetcherLive(client: Client) extends OutputFetcher:

  override def fetchOutput(
      workspaceUrl: String,
      token: String,
      runId: Long
  ): IO[DatabricksError, Option[NotebookOutput]] =
    val apiUrl = DatabricksApiPaths.buildGetOutputUrl(workspaceUrl, runId)

    ZIO
      .scoped {
        client
          .request(Request.get(apiUrl).addHeader("Authorization", s"Bearer $token"))
          .flatMap { response =>
            response.body.asString.flatMap { jsonStr =>
              if response.status.isSuccess then
                ZIO.logInfo(s"Notebook output response length: ${jsonStr.length} chars").as {
                  OutputParser.extractResultField(jsonStr) match
                    case Some(result) => Some(NotebookOutput(result = Some(result.trim)))
                    case None         => Some(NotebookOutput(result = Some(jsonStr)))
                }
              else ZIO.logWarning(s"Failed to fetch output: HTTP ${response.status.code}").as(None)
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)

object OutputFetcher:
  val layer: ZLayer[Client, Nothing, OutputFetcher] =
    ZLayer.fromFunction(OutputFetcherLive.apply _)
