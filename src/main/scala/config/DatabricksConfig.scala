package config

import zio.*

// Configuration for Databricks REST API integration
// Holds all settings needed to connect to Databricks and execute notebooks
case class DatabricksConfig(
    workspaceUrl: String,                   // Databricks workspace URL (from DATABRICKS_HOST env var)
    token: String,                          // Personal access token for API auth (from DATABRICKS_TOKEN)
    notebookPath: String,                   // Absolute path to notebook in workspace (from NOTEBOOK_PATH)
    maxPollAttempts: Int = 30,              // Max times to check if notebook completed (default: 30 checks)
    pollIntervalSeconds: Int = 2,           // Seconds between status checks (default: 2s polling)
    maxVisualizationRows: Int = 1000,       // Row limit for frontend display
    timeoutSeconds: Int = 300,              // Overall execution timeout (5 minutes)
    captureExecutionPlan: Boolean = true,   // Capture Spark query plans for DAG viz
    capturePartitionInfo: Boolean = true,   // Capture partition distribution data
    slowDownFactor: Double = 1.0            // Speed multiplier for teaching demos
)

object DatabricksConfig:

  // Security: minimum token length to accept
  private val MinTokenLength        = 10
  // Databricks tokens usually start with "dapi"
  private val DatabricksTokenPrefix = "dapi"

  // Polling bounds to prevent unreasonable values
  private val MinPollAttempts        = 1
  private val MaxPollAttempts        = 1000
  private val MinPollIntervalSeconds = 1
  private val MaxPollIntervalSeconds = 300

  // Prevent infinite URL decode loops
  private val MaxUrlDecodeIterations = 5

  // Visualization parameter limits
  private val MinVisualizationRows      = 10
  private val MaxVisualizationRowsLimit = 10000
  private val MinTimeoutSeconds         = 30
  private val MaxTimeoutSeconds         = 3600
  private val MinSlowDownFactor         = 0.1
  private val MaxSlowDownFactor         = 10.0

  // Get a required environment variable or fail with descriptive error
  private def getRequiredEnv(name: String): IO[String, String] =
    ZIO
      .fromOption(sys.env.get(name))
      .orElseFail(s"Missing required environment variable: $name")

  // Validate Databricks workspace URL - must be HTTPS and end with .databricks.com
  private def validateUrl(url: String): IO[String, String] =
    scala.util.Try {
      val uri    = new java.net.URI(url)
      val host   = Option(uri.getHost).getOrElse("")
      val scheme = Option(uri.getScheme).getOrElse("")

      // Security: HTTPS only, must be actual Databricks domain
      if (
        scheme == "https" &&
        host.endsWith(".databricks.com") &&
        host != ".databricks.com" &&
        host.length > ".databricks.com".length
      ) {
        url
      } else {
        throw new IllegalArgumentException("Invalid URL format")
      }
    }.toEither match {
      case Right(validUrl) => ZIO.succeed(validUrl)
      case Left(_)         => ZIO.fail(s"Invalid Databricks workspace URL format. Expected: https://<workspace>.databricks.com")
    }

  // Validate token format - must meet length and format requirements
  private def validateToken(token: String): IO[String, String] =
    val isValidFormat = token.nonEmpty &&
      token.length >= MinTokenLength &&          // Must be long enough
      token.startsWith(DatabricksTokenPrefix) && // Should start with "dapi"
      token.matches("^[a-zA-Z0-9-]+$")           // Only alphanumeric and hyphens

    if (isValidFormat) {
      ZIO.succeed(token)
    } else {
      ZIO.fail("Invalid Databricks token format") // Generic error to avoid leaking validation rules
    }

  // Validate notebook path with security checks for path traversal attacks
  private def validateNotebookPath(path: String): IO[String, String] =
    // Helper: fully decode URL encoding to catch multi-level encoding attacks
    def fullyDecode(input: String): Either[String, String] =
      try {
        var currentDecoded  = input
        var previousDecoded = ""
        var iterations      = 0

        // Keep decoding until result stabilizes (prevents %252e%252e → %2e%2e → ..)
        while (currentDecoded != previousDecoded && iterations < MaxUrlDecodeIterations) {
          previousDecoded = currentDecoded
          currentDecoded = java.net.URLDecoder.decode(currentDecoded, java.nio.charset.StandardCharsets.UTF_8)
          iterations += 1
        }

        Right(currentDecoded)
      } catch {
        case _: IllegalArgumentException =>
          Left("Malformed URL encoding in path") // Reject malformed encoding
      }

    // Decode the path
    val decodedPath = fullyDecode(path) match {
      case Right(decoded) => decoded
      case Left(error)    => return ZIO.fail(s"Invalid notebook path: $error")
    }

    // Security checks on decoded path
    val pathComponents        = decodedPath.split('/').filter(_.nonEmpty)
    val containsPathTraversal = pathComponents.contains("..") // Block /../ attacks
    val containsCurrentDir    = pathComponents.contains(".")  // Block /./ sequences
    val hasBackslash          = decodedPath.contains("\\")    // Unix paths only

    // Must be absolute path with safe characters only
    val isValidFormat = decodedPath.nonEmpty &&
      decodedPath.startsWith("/") &&               // Absolute path required
      decodedPath.length > 1 &&                    // More than just "/"
      !containsPathTraversal &&                    // No path traversal
      !containsCurrentDir &&                       // No current dir refs
      !hasBackslash &&                             // No backslashes
      decodedPath.matches("^/[a-zA-Z0-9/_@.-]+$")  // Safe chars only (no spaces, allows @, dots)

    if (isValidFormat) {
      ZIO.succeed(path) // Return original path (API expects it as-is)
    } else {
      ZIO.fail(
        "Invalid notebook path format. Path must start with '/', cannot contain '..' or '\\', and must use safe characters."
      )
    }

  // Validate max poll attempts is in acceptable range
  private def validatePollAttempts(attempts: Int): IO[String, Int] =
    if (attempts >= MinPollAttempts && attempts <= MaxPollAttempts) {
      ZIO.succeed(attempts)
    } else {
      ZIO.fail(s"Invalid MAX_POLL_ATTEMPTS value: $attempts. Must be between $MinPollAttempts and $MaxPollAttempts.")
    }

  // Validate poll interval is in acceptable range
  private def validatePollInterval(interval: Int): IO[String, Int] =
    if (interval >= MinPollIntervalSeconds && interval <= MaxPollIntervalSeconds) {
      ZIO.succeed(interval)
    } else {
      ZIO.fail(
        s"Invalid POLL_INTERVAL_SECONDS value: $interval. Must be between $MinPollIntervalSeconds and $MaxPollIntervalSeconds seconds."
      )
    }

  // Validate visualization rows limit
  private def validateVisualizationRows(rows: Int): IO[String, Int] =
    if (rows >= MinVisualizationRows && rows <= MaxVisualizationRowsLimit) {
      ZIO.succeed(rows)
    } else {
      ZIO.fail(
        s"Invalid maxVisualizationRows value: $rows. Must be between $MinVisualizationRows and $MaxVisualizationRowsLimit."
      )
    }

  // Validate timeout is reasonable (not too short or too long)
  private def validateTimeout(seconds: Int): IO[String, Int] =
    if (seconds >= MinTimeoutSeconds && seconds <= MaxTimeoutSeconds) {
      ZIO.succeed(seconds)
    } else {
      ZIO.fail(s"Invalid timeout value: $seconds. Must be between $MinTimeoutSeconds and $MaxTimeoutSeconds seconds.")
    }

  // Validate slowdown factor for teaching demos
  private def validateSlowDownFactor(factor: Double): IO[String, Double] =
    if (factor >= MinSlowDownFactor && factor <= MaxSlowDownFactor) {
      ZIO.succeed(factor)
    } else {
      ZIO.fail(s"Invalid slowDownFactor value: $factor. Must be between $MinSlowDownFactor and $MaxSlowDownFactor.")
    }

  // Get optional env var as Int, fall back to default if missing/invalid
  private def getOptionalEnvInt(name: String, default: Int): ZIO[Any, Nothing, Int] =
    sys.env.get(name) match {
      case None        =>
        ZIO.succeed(default) // Not set - use default
      case Some(value) =>
        value.toIntOption match {
          case Some(intValue) =>
            ZIO.succeed(intValue) // Successfully parsed
          case None           =>
            // Invalid value - log warning and use default
            ZIO
              .logWarning(
                s"Invalid integer value for environment variable $name: '$value'. Using default value: $default"
              )
              .as(default)
        }
    }

  // Get optional env var as Double, fall back to default if missing/invalid
  private def getOptionalEnvDouble(name: String, default: Double): ZIO[Any, Nothing, Double] =
    sys.env.get(name) match {
      case None        =>
        ZIO.succeed(default)
      case Some(value) =>
        value.toDoubleOption match {
          case Some(doubleValue) =>
            ZIO.succeed(doubleValue)
          case None              =>
            ZIO
              .logWarning(
                s"Invalid double value for environment variable $name: '$value'. Using default value: $default"
              )
              .as(default)
        }
    }

  // Get optional env var as Boolean, fall back to default if missing/invalid
  private def getOptionalEnvBoolean(name: String, default: Boolean): ZIO[Any, Nothing, Boolean] =
    sys.env.get(name) match {
      case None        =>
        ZIO.succeed(default)
      case Some(value) =>
        value.toLowerCase match {
          case "true" | "1" | "yes" | "on"  => ZIO.succeed(true)
          case "false" | "0" | "no" | "off" => ZIO.succeed(false)
          case _                            =>
            ZIO
              .logWarning(
                s"Invalid boolean value for environment variable $name: '$value'. Using default value: $default"
              )
              .as(default)
        }
    }

  // ZLayer that loads and validates config from environment variables
  val layer: ZLayer[Any, String, DatabricksConfig] =
    ZLayer.fromZIO(
      for {
        // Load and validate required config
        workspaceUrl <- getRequiredEnv("DATABRICKS_HOST").flatMap(validateUrl)
        token        <- getRequiredEnv("DATABRICKS_TOKEN").flatMap(validateToken)
        notebookPath <- getRequiredEnv("NOTEBOOK_PATH").flatMap(validateNotebookPath)

        // Load and validate polling config
        maxPollAttemptsRaw     <- getOptionalEnvInt("MAX_POLL_ATTEMPTS", 30)
        maxPollAttempts        <- validatePollAttempts(maxPollAttemptsRaw)
        pollIntervalSecondsRaw <- getOptionalEnvInt("POLL_INTERVAL_SECONDS", 2)
        pollIntervalSeconds    <- validatePollInterval(pollIntervalSecondsRaw)

        // Load and validate visualization config
        enableDetailedLogging   <- getOptionalEnvBoolean("ENABLE_DETAILED_LOGGING", false)
        maxVisualizationRowsRaw <- getOptionalEnvInt("MAX_VISUALIZATION_ROWS", 1000)
        maxVisualizationRows    <- validateVisualizationRows(maxVisualizationRowsRaw)
        timeoutSecondsRaw       <- getOptionalEnvInt("TIMEOUT_SECONDS", 300)
        timeoutSeconds          <- validateTimeout(timeoutSecondsRaw)
        captureExecutionPlan    <- getOptionalEnvBoolean("CAPTURE_EXECUTION_PLAN", true)
        capturePartitionInfo    <- getOptionalEnvBoolean("CAPTURE_PARTITION_INFO", true)
        slowDownFactorRaw       <- getOptionalEnvDouble("SLOW_DOWN_FACTOR", 1.0)
        slowDownFactor          <- validateSlowDownFactor(slowDownFactorRaw)
      } yield DatabricksConfig(
        workspaceUrl = workspaceUrl,
        token = token,
        notebookPath = notebookPath,
        maxPollAttempts = maxPollAttempts,
        pollIntervalSeconds = pollIntervalSeconds,
        enableDetailedLogging = enableDetailedLogging,
        maxVisualizationRows = maxVisualizationRows,
        timeoutSeconds = timeoutSeconds,
        captureExecutionPlan = captureExecutionPlan,
        capturePartitionInfo = capturePartitionInfo,
        slowDownFactor = slowDownFactor
      )
    )
