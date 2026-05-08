package service

// Error hierarchy for Databricks operations. Provides user-facing and technical messages.
sealed trait DatabricksError extends Throwable:
  // Short message safe to display in the UI.
  def toUserMessage: String

  // Detailed message for server-side logs and diagnostics.
  def getMessage: String

object DatabricksError:
  // Configuration is invalid or missing required environment variables.
  case class ConfigError(message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Configuration error. Please verify DATABRICKS_HOST, DATABRICKS_TOKEN, and NOTEBOOK_PATH environment variables."

    override def getMessage: String = message

  // Network or HTTP communication failure calling Databricks REST API.
  case class ApiCommunicationError(message: String, cause: Option[Throwable] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to communicate with Databricks API. Please check network connectivity and workspace URL."

    override def getMessage: String = message

    // Preserve exception chain for debugging
    cause.foreach(initCause)

  // Databricks API returned a non-2xx HTTP status code.
  case class ApiResponseError(statusCode: Int, message: String) extends DatabricksError:
    override def toUserMessage: String =
      statusCode match {
        case 401 =>
          "Authentication failed. Please verify your DATABRICKS_TOKEN is valid and has not expired."
        case 403 =>
          "Access denied. Please ensure your Databricks token has the necessary API Scope of jobs, workspace, files, unity-catalog and clusters"
        case 404 =>
          "Resource not found. Please verify NOTEBOOK_PATH exists in your Databricks workspace."
        case _   =>
          s"Databricks API error (HTTP $statusCode). Please check your configuration and try again."
      }

    override def getMessage: String = s"API error (HTTP $statusCode): $message"

  // Failed to parse Databricks API response body as JSON.
  case class JsonParseError(message: String, json: Option[String] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to parse Databricks API response. The API may have changed or returned unexpected data."

    override def getMessage: String =
      json match {
        case Some(rawJson) if rawJson.length > 200 =>
          s"JSON parse error: $message. Raw JSON (truncated): ${rawJson.take(200)}..."
        case Some(rawJson)                         =>
          s"JSON parse error: $message. Raw JSON: $rawJson"
        case None                                  =>
          s"JSON parse error: $message"
      }

  // Notebook execution timed out while polling for completion.
  case class ExecutionTimeout(runId: Long, maxAttempts: Int, pollInterval: Int) extends DatabricksError:
    override def toUserMessage: String =
      s"Notebook execution timed out after ${(maxAttempts + 1) * pollInterval} seconds. The notebook may be taking longer than expected."

    override def getMessage: String =
      s"Execution timeout for run_id=$runId after $maxAttempts polling attempts (interval: ${pollInterval}s)"

  // Notebook execution finished with a non-success terminal state.
  case class ExecutionFailed(runId: Long, state: String, stateMessage: Option[String] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Notebook execution failed. Please check the notebook code and Databricks workspace for errors."

    override def getMessage: String =
      stateMessage match {
        case Some(msg) => s"Execution failed for run_id=$runId with state=$state: $msg"
        case None      => s"Execution failed for run_id=$runId with state=$state"
      }

  // Multi-task job response missing the expected task run.
  case class TaskNotFound(runId: Long, message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to retrieve task information from Databricks. The job structure may be unexpected."

    override def getMessage: String =
      s"Task not found for run_id=$runId: $message"

  // Client-side validation failure for workspace URL or token.
  case class ValidationError(message: String) extends DatabricksError:
    override def toUserMessage: String = message
    override def getMessage: String    = message

  // Request body parsing or field validation error.
  case class BadRequestError(message: String) extends DatabricksError:
    override def toUserMessage: String = "Bad request. Please check your inputs and try again."
    override def getMessage: String    = message

  // Missing or expired authentication credentials.
  case class NotAuthenticated(message: String = "Not authenticated") extends DatabricksError:
    override def toUserMessage: String = "Not authenticated. Please log in again."
    override def getMessage: String    = message

  // Databricks token lacks the required API scopes.
  case class InsufficientPermissions(message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Insufficient permissions. Please ensure your Databricks token has the necessary API Scope of jobs, workspace, files, unity-catalog and clusters."
    override def getMessage: String    = message

  // Convert any Throwable into a DatabricksError wrapper.
  def fromThrowable(error: Throwable): DatabricksError =
    error match {
      case e: DatabricksError => e
      case e                  =>
        val message = Option(e.getMessage).getOrElse(s"${e.getClass.getName}: No error message available")
        ApiCommunicationError(message, Some(e))
    }
