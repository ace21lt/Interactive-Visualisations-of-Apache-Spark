package service

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

// Databricks REST API path constants and URL builders.
object DatabricksApiPaths:

  private val ApiVersion  = "/api/2.1"
  private val ApiVersion2 = "/api/2.0"

  // Jobs API endpoints
  object Jobs:
    val Submit: String    = s"$ApiVersion/jobs/runs/submit"
    val Get: String       = s"$ApiVersion/jobs/runs/get"
    val GetOutput: String = s"$ApiVersion/jobs/runs/get-output"

  // Workspace API endpoints
  object Workspace:
    val Import: String = s"$ApiVersion2/workspace/import"
    val Mkdirs: String = s"$ApiVersion2/workspace/mkdirs"

  // Files API endpoint base
  object Files:
    val Base: String = s"$ApiVersion2/fs/files"

  // URL builders

  // Jobs run status URL
  def buildGetRunUrl(workspaceUrl: String, runId: Long): String =
    s"$workspaceUrl${Jobs.Get}?run_id=$runId"

  // Jobs run output URL
  def buildGetOutputUrl(workspaceUrl: String, runId: Long): String =
    s"$workspaceUrl${Jobs.GetOutput}?run_id=$runId"

  // Jobs run submission URL
  def buildSubmitUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Jobs.Submit}"

  // Workspace notebook import URL
  def buildWorkspaceImportUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Workspace.Import}"

  // Workspace mkdirs URL
  def buildWorkspaceMkdirsUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Workspace.Mkdirs}"

  // Build the Files API URL for a given volume path; URL-encode each segment.
  def buildFilesUrl(workspaceUrl: String, volumePath: String): String =
    val normalised                           = volumePath.stripPrefix("/")
    // Encode each path segment separately (preserves slashes) and replace + with %20
    def encodeSegments(path: String): String =
      path
        .split('/')
        .filter(_.nonEmpty)
        .map(seg => URLEncoder.encode(seg, StandardCharsets.UTF_8).replace("+", "%20"))
        .mkString("/")

    val encoded = encodeSegments(normalised)
    s"${workspaceUrl.stripSuffix("/")}${Files.Base}/$encoded"
