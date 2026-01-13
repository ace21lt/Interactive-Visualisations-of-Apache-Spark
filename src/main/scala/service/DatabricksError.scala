package service

// Structured error hierarchy for Databricks operations
// Using sealed trait ensures exhaustive pattern matching and type-safe error handling
sealed trait DatabricksError extends Throwable:
  // User-friendly error message that doesn't leak sensitive information
  def toUserMessage: String

  // Technical message for logging (may contain more details)
  def getMessage: String

object DatabricksError:
  // Configuration validation errors (e.g., invalid URL, token format)
  case class ConfigError(message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Configuration error. Please verify DATABRICKS_HOST, DATABRICKS_TOKEN, and NOTEBOOK_PATH environment variables."

    override def getMessage: String = message

  // Network/HTTP communication errors when calling Databricks API
  case class ApiCommunicationError(message: String, cause: Option[Throwable] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to communicate with Databricks API. Please check network connectivity and workspace URL."

    override def getMessage: String = message

    // Preserve exception chain for debugging
    cause.foreach(initCause)

  // Databricks API returned an error response (4xx/5xx status codes)
  case class ApiResponseError(statusCode: Int, message: String) extends DatabricksError:
    override def toUserMessage: String =
      statusCode match {
        case 401 | 403 =>
          "Authentication failed. Please verify your DATABRICKS_TOKEN is valid and has not expired."
        case 404       =>
          "Resource not found. Please verify NOTEBOOK_PATH exists in your Databricks workspace."
        case _         =>
          s"Databricks API error (HTTP $statusCode). Please check your configuration and try again."
      }

    override def getMessage: String = s"API error (HTTP $statusCode): $message"

  // Failed to parse JSON response from Databricks API
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

  // Notebook execution timed out (exceeded max poll attempts)
  case class ExecutionTimeout(runId: Long, maxAttempts: Int, pollInterval: Int) extends DatabricksError:
    override def toUserMessage: String =
      s"Notebook execution timed out after ${maxAttempts * pollInterval} seconds. The notebook may be taking longer than expected."

    override def getMessage: String =
      s"Execution timeout for run_id=$runId after $maxAttempts polling attempts (interval: ${pollInterval}s)"

  // Notebook execution failed (TERMINATED state with non-SUCCESS result)
  case class ExecutionFailed(runId: Long, state: String, stateMessage: Option[String] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Notebook execution failed. Please check the notebook code and Databricks workspace for errors."

    override def getMessage: String =
      stateMessage match {
        case Some(msg) => s"Execution failed for run_id=$runId with state=$state: $msg"
        case None      => s"Execution failed for run_id=$runId with state=$state"
      }

  // Task run ID not found in multi-task job response
  case class TaskNotFound(runId: Long, message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to retrieve task information from Databricks. The job structure may be unexpected."

    override def getMessage: String =
      s"Task not found for run_id=$runId: $message"

  // Helper to convert generic Throwable to DatabricksError
  def fromThrowable(error: Throwable): DatabricksError =
    error match {
      case e: DatabricksError => e
      case e                  => ApiCommunicationError(e.getMessage, Some(e))
    }
