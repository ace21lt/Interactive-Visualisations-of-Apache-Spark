package config

import service.DatabricksError
import zio.*

// Databricks integration configuration. Environment vars (examples):
// DATABRICKS_HOST, DATABRICKS_TOKEN, NOTEBOOK_IMPORT_DIR, DATASET_VOLUME_PATH,
// MAX_POLL_ATTEMPTS, POLL_INTERVAL_SECONDS, TIMEOUT_SECONDS, SECURE_COOKIES
case class DatabricksConfig(
    workspaceUrl: Option[String] = None,
    token: Option[String] = None,
    notebookImportBase: String = "/tmp/spark-viz",
    datasetVolumePath: String = "/Volumes/main/default/sparkml_tmp",
    maxPollAttempts: Int = 60,
    pollIntervalSeconds: Int = 3,
    maxVisualisationRows: Int = 1000,
    timeoutSeconds: Int = 300,
    captureExecutionPlan: Boolean = true,
    capturePartitionInfo: Boolean = true,
    secureCookies: Boolean = false,
    corsAllowedOrigins: Set[String] = Set("http://localhost:3000")
):
  def directCredentials: Option[(String, String)] =
    for
      url <- workspaceUrl
      tok <- token
    yield (url.stripSuffix("/"), tok)

  def isDirectMode: Boolean = directCredentials.isDefined

  def notebookImportDir: IO[DatabricksError, String] =
    ZIO.succeed(notebookImportBase)

object DatabricksConfig:

  // Validate a single CORS origin: must parse as a URI with a non-empty
  // scheme (http or https) and a non-empty host, and no path/query component.
  private def validateCorsOrigin(origin: String): IO[String, String] =
    ZIO.fromEither(
      try
        val uri    = new java.net.URI(origin)
        val scheme = Option(uri.getScheme).map(_.toLowerCase).getOrElse("")
        val host   = Option(uri.getHost).getOrElse("")
        if scheme != "http" && scheme != "https" then Left(s"CORS origin '$origin' must use http or https scheme")
        else if host.isEmpty then Left(s"CORS origin '$origin' must include a host")
        else if uri.getPath != null && uri.getPath.nonEmpty && uri.getPath != "/" then
          Left(s"CORS origin '$origin' must not contain a path component")
        else if uri.getQuery != null then Left(s"CORS origin '$origin' must not contain a query component")
        else Right(origin)
      catch
        case _: java.net.URISyntaxException =>
          Left(s"CORS origin '$origin' is not a valid URI")
    )

  private val MinPollAttempts           = 1
  private val MaxPollAttempts           = 1000
  private val MinPollIntervalSeconds    = 1
  private val MaxPollIntervalSeconds    = 300
  private val MinVisualisationRows      = 10
  private val MaxVisualisationRowsLimit = 10000
  private val MinTimeoutSeconds         = 30
  private val MaxTimeoutSeconds         = 3600

  val layer: ZLayer[Any, String, DatabricksConfig] =
    ZLayer.fromZIO(
      for
        hostOpt    <- ConfigReader.getOptionalEnv("DATABRICKS_HOST")
        tokenOpt   <- ConfigReader.getOptionalEnv("DATABRICKS_TOKEN")
        validHost  <- ZIO.foreach(hostOpt)(ConfigValidation.validateDirectUrl)
        validToken <- ZIO.foreach(tokenOpt)(ConfigValidation.validateDirectToken)

        _ <- ZIO.when(validHost.isDefined && validToken.isDefined)(
               ZIO.logInfo("Direct mode: DATABRICKS_HOST/TOKEN set in environment")
             )
        _ <- ZIO.when(validHost.isEmpty || validToken.isEmpty)(
               ZIO.logInfo("PAT session mode: students supply workspace URL + PAT at login")
             )

        importDir   <- ConfigReader.getOptionalEnv("NOTEBOOK_IMPORT_DIR")
        datasetPath <- ConfigReader.getOptionalEnv("DATASET_VOLUME_PATH")

        _ <- ZIO.logInfo(
               s"Dataset volume path: ${datasetPath.getOrElse("/Volumes/main/default/sparkml_tmp")}"
             )

        maxPoll      <- ConfigReader.getOptionalEnvInt("MAX_POLL_ATTEMPTS", 60, MinPollAttempts, MaxPollAttempts)
        pollInterval <-
          ConfigReader.getOptionalEnvInt("POLL_INTERVAL_SECONDS", 3, MinPollIntervalSeconds, MaxPollIntervalSeconds)
        maxRows      <- ConfigReader.getOptionalEnvInt(
                          "MAX_VISUALISATION_ROWS",
                          1000,
                          MinVisualisationRows,
                          MaxVisualisationRowsLimit
                        )
        timeout      <- ConfigReader.getOptionalEnvInt("TIMEOUT_SECONDS", 300, MinTimeoutSeconds, MaxTimeoutSeconds)
        capPlan      <- ConfigReader.getOptionalEnvBoolean("CAPTURE_EXECUTION_PLAN", true)
        capParts     <- ConfigReader.getOptionalEnvBoolean("CAPTURE_PARTITION_INFO", true)

        secureCookies <- ConfigReader.getOptionalEnvBoolean("SECURE_COOKIES", false)
        _             <- ZIO.when(secureCookies)(ZIO.logInfo("Secure cookies enabled (HTTPS mode)"))
        _             <- ZIO.when(!secureCookies)(
                           ZIO.logInfo("Secure cookies disabled — set SECURE_COOKIES=true when serving over HTTPS")
                         )

        corsOriginsRaw     <- ConfigReader.getOptionalEnv("CORS_ALLOWED_ORIGINS")
        corsAllowedOrigins <- corsOriginsRaw match
                                case None      =>
                                  ZIO.succeed(Set("http://localhost:3000"))
                                case Some(raw) =>
                                  val candidates = raw.split(",").map(_.trim).filter(_.nonEmpty)
                                  ZIO
                                    .foreach(candidates.toList) { origin =>
                                      validateCorsOrigin(origin)
                                    }
                                    .map(_.toSet)
        _                  <- ZIO.logInfo(s"CORS allowed origins: ${corsAllowedOrigins.mkString(", ")}")
      yield DatabricksConfig(
        workspaceUrl = validHost,
        token = validToken,
        notebookImportBase = importDir.getOrElse("/tmp/spark-viz"),
        datasetVolumePath = datasetPath.getOrElse("/Volumes/main/default/sparkml_tmp"),
        maxPollAttempts = maxPoll,
        pollIntervalSeconds = pollInterval,
        maxVisualisationRows = maxRows,
        timeoutSeconds = timeout,
        captureExecutionPlan = capPlan,
        capturePartitionInfo = capParts,
        secureCookies = secureCookies,
        corsAllowedOrigins = corsAllowedOrigins
      )
    )
