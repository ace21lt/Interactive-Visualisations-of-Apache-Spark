package databricks

import service.{DatabricksApiPaths, DatabricksError}
import zio.*
import zio.http.*
import zio.Chunk

// Result of dataset provisioning: resolved volume path and whether the optimized Delta exists.
case class DatasetProvisionResult(volumePath: String, deltaTableExists: Boolean)

// Ensures dataset files exist in the student's workspace and detects an existing optimized Delta.
trait DatasetProvisioner:
  // Discover the volume path and ensure all dataset files are uploaded.
  def ensureDatasets(
      workspaceUrl: String,
      token: String
  ): IO[DatabricksError, DatasetProvisionResult]

case class DatasetProvisionerLive(client: Client) extends DatasetProvisioner:

  // Dataset resource files bundled in src/main/resources/.
  private val datasets = List(
    "NASA_Aug95_100.txt",
    "NASA_access_log_Aug95.gz",
    "Advertising.csv"
  )

  // Sentinel path inside the Delta log to detect an optimized Delta table.
  private val DeltaLogSentinel = "NASA_logs_optimised/_delta_log/00000000000000000000.json"

  override def ensureDatasets(
      workspaceUrl: String,
      token: String
  ): IO[DatabricksError, DatasetProvisionResult] =
    for
      // Auto-discover the student's default volume from their workspace catalog
      volumePath       <- CatalogDiscovery.discoverVolumePath(workspaceUrl, token, client)
      _                <- ZIO.foreachDiscard(datasets) { filename =>
                            val destPath = s"${volumePath.stripSuffix("/")}/$filename"
                            ensureFile(workspaceUrl, token, filename, destPath)
                          }
      // Check if the optimized Delta table sentinel file already exists
      sentinelPath      = s"${volumePath.stripSuffix("/")}/$DeltaLogSentinel"
      deltaTableExists <- checkExists(workspaceUrl, token, sentinelPath)
      _                <- ZIO.logInfo(s"Delta table exists: $deltaTableExists ($sentinelPath)")
    yield DatasetProvisionResult(volumePath, deltaTableExists)

  // Upload a dataset file if it doesn't already exist.
  private def ensureFile(
      workspaceUrl: String,
      token: String,
      resourceName: String,
      destPath: String
  ): IO[DatabricksError, Unit] =
    for
      exists <- checkExists(workspaceUrl, token, destPath)
      _      <- if exists then ZIO.logInfo(s"Dataset already exists, skipping upload: $destPath")
                else
                  ZIO.logInfo(s"Uploading dataset: $resourceName -> $destPath") *>
                    uploadFile(workspaceUrl, token, resourceName, destPath)
    yield ()

  // Check if a file exists using HTTP HEAD: 200 = exists, 404 = missing.
  private def checkExists(
      workspaceUrl: String,
      token: String,
      destPath: String
  ): IO[DatabricksError, Boolean] =
    val rawUrl = DatabricksApiPaths.buildFilesUrl(workspaceUrl, destPath)
    ZIO
      .fromEither(URL.decode(rawUrl))
      .orElseFail(DatabricksError.ConfigError(s"Failed to decode URL for HEAD check: $rawUrl"))
      .flatMap { parsedUrl =>
        ZIO
          .scoped {
            client
              .request(
                Request(
                  method = Method.HEAD,
                  url = parsedUrl
                ).addHeader("Authorization", s"Bearer $token")
              )
              .map(_.status.code == 200)
          }
          .mapError(DatabricksError.fromThrowable)
          .catchAll { err =>
            ZIO.logWarning(s"HEAD check failed for $destPath: ${err.getMessage}").as(false)
          }
      }

  // Upload dataset bytes to the Files API (HTTP PUT).
  private def uploadFile(
      workspaceUrl: String,
      token: String,
      resourceName: String,
      destPath: String
  ): IO[DatabricksError, Unit] =
    val rawUrl = DatabricksApiPaths.buildFilesUrl(workspaceUrl, destPath)
    for
      parsedUrl <- ZIO
                     .fromEither(URL.decode(rawUrl))
                     .orElseFail(DatabricksError.ConfigError(s"Failed to decode URL for upload: $rawUrl"))
      bytes     <- loadResource(resourceName)
      _         <- ZIO
                     .scoped {
                       for
                         response <- client.request(
                                       Request(
                                         method = Method.PUT,
                                         url = parsedUrl,
                                         body = Body.fromChunk(bytes)
                                       )
                                         .addHeader("Authorization", s"Bearer $token")
                                         .addHeader("Content-Type", "application/octet-stream")
                                     )
                         body     <- response.body.asString
                         _        <-
                           if response.status.isSuccess then ZIO.logInfo(s"Uploaded $resourceName -> $destPath")
                           else
                             ZIO.fail(
                               new RuntimeException(
                                 s"Files API upload failed for $resourceName: " +
                                   s"HTTP ${response.status.code} — $body"
                               )
                             )
                       yield ()
                     }
                     .mapError(DatabricksError.fromThrowable)
    yield ()

  // Load a dataset file from classpath resources (UTF-8 bytes).
  private def loadResource(filename: String): IO[DatabricksError, Chunk[Byte]] =
    ZIO
      .attempt {
        val stream = getClass.getClassLoader.getResourceAsStream(filename)
        if stream == null then
          throw new IllegalStateException(
            s"Dataset not found on classpath: $filename. " +
              s"Place it directly under src/main/resources/ before building."
          )
        val bytes  = stream.readAllBytes()
        stream.close()
        Chunk.fromArray(bytes)
      }
      .mapError(e =>
        DatabricksError.ConfigError(
          s"Failed to load dataset '$filename' from classpath: ${e.getMessage}"
        )
      )

object DatasetProvisioner:
  val layer: ZLayer[Client, Nothing, DatasetProvisioner] =
    ZLayer.fromFunction(DatasetProvisionerLive.apply _)
