package service

// Constants and helper methods for Databricks REST API endpoints
// Centralizes API paths to avoid hardcoded strings throughout the codebase
object DatabricksApiPaths:

  // Base API version prefix for all Databricks API endpoints
  private val ApiVersion = "/api/2.1"

  // Jobs API endpoints
  object Jobs:
    // Submit a new job run (supports both SINGLE_TASK and MULTI_TASK formats)
    val Submit: String = s"$ApiVersion/jobs/runs/submit"

    // Get run status and details (requires run_id query parameter)
    val Get: String = s"$ApiVersion/jobs/runs/get"

    // Get notebook output for a completed run (requires run_id query parameter)
    val GetOutput: String = s"$ApiVersion/jobs/runs/get-output"

  // Helper methods for building complete API URLs with query parameters

  // Build URL for getting run status
  def buildGetRunUrl(workspaceUrl: String, runId: Long): String =
    s"$workspaceUrl${Jobs.Get}?run_id=$runId"

  // Build URL for getting notebook output
  def buildGetOutputUrl(workspaceUrl: String, runId: Long): String =
    s"$workspaceUrl${Jobs.GetOutput}?run_id=$runId"

  // Build URL for submitting a notebook run
  def buildSubmitUrl(workspaceUrl: String): String =
    s"$workspaceUrl${Jobs.Submit}"
