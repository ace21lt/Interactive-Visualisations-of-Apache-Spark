package service

// Error hierarchy for Databricks operations.
sealed trait DatabricksError extends Throwable:
  def toUserMessage: String

  def logMessage: String

object DatabricksError:
  case class ConfigError(message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Configuration error. Please verify DATABRICKS_HOST, DATABRICKS_TOKEN, and NOTEBOOK_PATH environment variables."

    override def logMessage: String = message

  case class ApiCommunicationError(message: String, cause: Option[Throwable] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to communicate with Databricks API. Please check network connectivity and workspace URL."

    override def logMessage: String = message

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

    override def logMessage: String = s"API error (HTTP $statusCode): $message"

  case class JsonParseError(message: String, json: Option[String] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to parse Databricks API response. The API may have changed or returned unexpected data."

    override def logMessage: String =
      json match {
        case Some(rawJson) if rawJson.length > 200 =>
          s"JSON parse error: $message. Raw JSON (truncated): ${rawJson.take(200)}..."
        case Some(rawJson)                         =>
          s"JSON parse error: $message. Raw JSON: $rawJson"
        case None                                  =>
          s"JSON parse error: $message"
      }

  case class ExecutionTimeout(runId: Long, maxAttempts: Int, pollInterval: Int) extends DatabricksError:
    override def toUserMessage: String =
      s"Notebook execution timed out after ${(maxAttempts + 1) * pollInterval} seconds. The notebook may be taking longer than expected."

    override def logMessage: String =
      s"Execution timeout for run_id=$runId after $maxAttempts polling attempts (interval: ${pollInterval}s)"

  case class ExecutionFailed(runId: Long, state: String, stateMessage: Option[String] = None) extends DatabricksError:
    override def toUserMessage: String =
      "Notebook execution failed. Please check the notebook code and Databricks workspace for errors."

    override def logMessage: String =
      stateMessage match {
        case Some(msg) => s"Execution failed for run_id=$runId with state=$state: $msg"
        case None      => s"Execution failed for run_id=$runId with state=$state"
      }

  case class TaskNotFound(runId: Long, message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Failed to retrieve task information from Databricks. The job structure may be unexpected."

    override def logMessage: String =
      s"Task not found for run_id=$runId: $message"

  case class ValidationError(message: String) extends DatabricksError:
    override def toUserMessage: String = message
    override def logMessage: String    = message

  case class BadRequestError(message: String) extends DatabricksError:
    override def toUserMessage: String = "Bad request. Please check your inputs and try again."
    override def logMessage: String    = message

  case class NotAuthenticated(message: String = "Not authenticated") extends DatabricksError:
    override def toUserMessage: String = "Not authenticated. Please log in again."
    override def logMessage: String    = message

  case class InsufficientPermissions(message: String) extends DatabricksError:
    override def toUserMessage: String =
      "Insufficient permissions. Please ensure your Databricks token has the necessary API Scope of jobs, workspace, files, unity-catalog and clusters."
    override def logMessage: String    = message

  def fromThrowable(error: Throwable): DatabricksError =
    error match {
      case e: DatabricksError => e
      case e                  =>
        val message = Option(e.getMessage).getOrElse(s"${e.getClass.getName}: No error message available")
        ApiCommunicationError(message, Some(e))
    }
