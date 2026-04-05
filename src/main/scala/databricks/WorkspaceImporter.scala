package databricks

import models.*
import service.{DatabricksApiPaths, DatabricksError}
import zio.*
import zio.http.*
import zio.json.*

import java.util.Base64
import java.lang.System.currentTimeMillis

// Imports a notebook into the Databricks workspace so the job submitter
// can run the user-modified version.
// Creates the parent directory first via mkdirs (idempotent) so the import
// never fails with RESOURCE_DOES_NOT_EXIST on a fresh workspace.
trait WorkspaceImporter:
  def importNotebook(
      workspaceUrl: String,
      token: String,
      workspacePath: String,
      source: String             // raw Python source text
  ): IO[DatabricksError, String] // returns the workspace path on success

case class WorkspaceImporterLive(client: Client) extends WorkspaceImporter:

  override def importNotebook(
      workspaceUrl: String,
      token: String,
      workspacePath: String,
      source: String
  ): IO[DatabricksError, String] =
    // Extract the parent directory and ensure it exists before importing.
    // POST /api/2.0/workspace/mkdirs is idempotent — safe on every call.
    val slashIdx = workspacePath.lastIndexOf('/')
    for
      parentDir <-
        ZIO
          .fromOption(Option.when(slashIdx > 0)(workspacePath.substring(0, slashIdx)))
          .orElseFail(
            DatabricksError.ConfigError(
              s"workspacePath must be an absolute path with at least one '/' separator, got: '$workspacePath'"
            )
          )
      _         <- mkdirs(workspaceUrl, token, parentDir)
      _         <- doImport(workspaceUrl, token, workspacePath, source)
    yield workspacePath

  private def mkdirs(
      workspaceUrl: String,
      token: String,
      path: String
  ): IO[DatabricksError, Unit] =
    val url  = DatabricksApiPaths.buildWorkspaceMkdirsUrl(workspaceUrl)
    val body = s"""{"path":"$path"}"""
    ZIO
      .scoped {
        client
          .request(
            Request
              .post(url, Body.fromString(body))
              .addHeader("Authorization", s"Bearer $token")
              .addHeader("Content-Type", "application/json")
          )
          .flatMap { response =>
            response.body.asString.flatMap { respBody =>
              if response.status.isSuccess then ZIO.logInfo(s"Workspace directory ready: $path")
              else
                ZIO.fail(
                  new RuntimeException(
                    s"workspace/mkdirs failed for $path: HTTP ${response.status.code} — $respBody"
                  )
                )
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)

  private def doImport(
      workspaceUrl: String,
      token: String,
      workspacePath: String,
      source: String
  ): IO[DatabricksError, Unit] =
    val apiUrl  = DatabricksApiPaths.buildWorkspaceImportUrl(workspaceUrl)
    val encoded = Base64.getEncoder.encodeToString(source.getBytes("UTF-8"))

    val requestBody = WorkspaceImportRequest(
      path = workspacePath,
      format = "SOURCE",
      language = "PYTHON",
      content = encoded,
      overwrite = true
    ).toJson

    ZIO
      .scoped {
        client
          .request(
            Request
              .post(apiUrl, Body.fromString(requestBody))
              .addHeader("Authorization", s"Bearer $token")
              .addHeader("Content-Type", "application/json")
          )
          .flatMap { response =>
            response.body.asString.flatMap { body =>
              if response.status.isSuccess then ZIO.logInfo(s"Workspace import succeeded: $workspacePath")
              else
                ZIO.logError(s"Workspace import failed: HTTP ${response.status.code} — $body") *>
                  ZIO.fail(
                    new RuntimeException(
                      s"workspace/import failed: HTTP ${response.status.code} — $body"
                    )
                  )
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)

object WorkspaceImporter:
  val layer: ZLayer[Client, Nothing, WorkspaceImporter] =
    ZLayer.fromFunction(WorkspaceImporterLive.apply _)

  // Produce a unique workspace destination path for each run so concurrent
  // users never overwrite each other's notebooks.
  def destinationPath(baseDir: String): String =
    val ts   = currentTimeMillis()
    val base = baseDir.stripSuffix("/")
    s"$base/spark_viz_lab1_$ts"
