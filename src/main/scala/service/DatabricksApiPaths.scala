package service

// Constants and helper methods for Databricks REST API endpoints
object DatabricksApiPaths:

  private val ApiVersion  = "/api/2.1"
  private val ApiVersion2 = "/api/2.0"

  // Jobs API
  object Jobs:
    val Submit: String    = s"$ApiVersion/jobs/runs/submit"
    val Get: String       = s"$ApiVersion/jobs/runs/get"
    val GetOutput: String = s"$ApiVersion/jobs/runs/get-output"

  // Workspace API (notebook import and directory management
  object Workspace:
    val Import: String = s"$ApiVersion2/workspace/import"
    val Mkdirs: String = s"$ApiVersion2/workspace/mkdirs"

  // Files API dataset upload/check via Unity Catalog Volumes
  // Path segments must NOT have a leading slash in the URL.
  object Files:
    val Base: String = s"$ApiVersion2/fs/files"

  // URL builders

  def buildGetRunUrl(workspaceUrl: String, runId: Long): String =
    s"$workspaceUrl${Jobs.Get}?run_id=$runId"

  def buildGetOutputUrl(workspaceUrl: String, runId: Long): String =
    s"$workspaceUrl${Jobs.GetOutput}?run_id=$runId"

  def buildSubmitUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Jobs.Submit}"

  def buildWorkspaceImportUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Workspace.Import}"

  def buildWorkspaceMkdirsUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Workspace.Mkdirs}"

  // Build Files API URL for a given volume path.
  // Strips the leading slash so the path segment is valid in the URL.
  def buildFilesUrl(workspaceUrl: String, volumePath: String): String =
    val normalised = volumePath.stripPrefix("/")
    s"$workspaceUrl${Files.Base}/$normalised"
