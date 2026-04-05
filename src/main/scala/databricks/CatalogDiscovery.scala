package databricks

import service.{DatabricksApiPaths, DatabricksError}
import zio.*
import zio.http.*
import zio.json.*

object CatalogDiscovery:

  // All known Databricks-managed catalogs that are never user-writable
  private val SystemCatalogs = Set(
    "system",
    "hive_metastore",
    "samples",
    "__databricks_internal",
    "databricks_marketplace"
  )

  private val VolumeName = "sparkml_tmp"

  def discoverVolumePath(
      workspaceUrl: String,
      token: String,
      client: Client
  ): IO[DatabricksError, String] =
    for
      catalog <- findWritableCatalog(workspaceUrl, token, client)
      _       <- ZIO.logInfo(s"Using catalog: $catalog")
      schema  <- findFirstSchema(workspaceUrl, token, client, catalog)
      _       <- ZIO.logInfo(s"Using schema: $catalog.$schema")
      _       <- ensureVolume(workspaceUrl, token, client, catalog, schema)
      path     = s"/Volumes/$catalog/$schema/$VolumeName"
      _       <- ZIO.logInfo(s"Resolved volume path: $path")
    yield path

  // Step 1: find a user-writable catalog

  private def findWritableCatalog(
      workspaceUrl: String,
      token: String,
      client: Client
  ): IO[DatabricksError, String] =
    val url = s"${workspaceUrl.stripSuffix("/")}/api/2.1/unity-catalog/catalogs"
    get[CatalogListResponse](url, token, client).flatMap { resp =>
      val userCatalogs = resp.catalogs
        .getOrElse(Nil)
        .map(_.name)
        .filterNot(SystemCatalogs.contains)

      ZIO.logInfo(s"User-accessible catalogs: ${userCatalogs.mkString(", ")}") *>
        (userCatalogs.headOption match
          case Some(c) => ZIO.succeed(c)
          case None    =>
            ZIO.fail(
              DatabricksError.ConfigError(
                s"No writable Unity Catalog catalogs found. " +
                  s"Available non-system catalogs were empty after filtering: $SystemCatalogs"
              )
            )
        )
    }

  // Step 2: find the first schema in the catalog

  private def findFirstSchema(
      workspaceUrl: String,
      token: String,
      client: Client,
      catalog: String
  ): IO[DatabricksError, String] =
    val url = s"${workspaceUrl.stripSuffix("/")}/api/2.1/unity-catalog/schemas?catalog_name=$catalog"
    get[SchemaListResponse](url, token, client).flatMap { resp =>
      val schemas = resp.schemas
        .getOrElse(Nil)
        .map(_.name)
        .filterNot(_ == "information_schema") // system schema, not user-writable

      ZIO.logInfo(s"Schemas in $catalog: ${schemas.mkString(", ")}") *>
        (schemas
          .find(_ == "default")
          .orElse(schemas.headOption) match
          case Some(s) => ZIO.succeed(s)
          case None    =>
            ZIO.fail(
              DatabricksError.ConfigError(
                s"No schemas found in catalog '$catalog'. " +
                  s"Please create a schema in your Databricks workspace."
              )
            )
        )
    }

  // Step 3: ensure sparkml_tmp volume exists (create if missing)

  private def ensureVolume(
      workspaceUrl: String,
      token: String,
      client: Client,
      catalog: String,
      schema: String
  ): IO[DatabricksError, Unit] =
    val listUrl = s"${workspaceUrl.stripSuffix("/")}/api/2.1/unity-catalog/volumes" +
      s"?catalog_name=$catalog&schema_name=$schema"
    get[VolumeListResponse](listUrl, token, client).flatMap { resp =>
      val volumes = resp.volumes.getOrElse(Nil).map(_.name)
      if volumes.contains(VolumeName) then ZIO.logInfo(s"Volume $catalog.$schema.$VolumeName already exists")
      else
        ZIO.logInfo(s"Creating volume $catalog.$schema.$VolumeName") *>
          createVolume(workspaceUrl, token, client, catalog, schema)
    }

  private def createVolume(
      workspaceUrl: String,
      token: String,
      client: Client,
      catalog: String,
      schema: String
  ): IO[DatabricksError, Unit] =
    val url  = s"${workspaceUrl.stripSuffix("/")}/api/2.1/unity-catalog/volumes"
    val body = s"""{"catalog_name":"$catalog","schema_name":"$schema","name":"$VolumeName","volume_type":"MANAGED"}"""
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
              if response.status.isSuccess then ZIO.logInfo(s"Created volume $catalog.$schema.$VolumeName")
              else
                ZIO.fail(
                  new RuntimeException(
                    s"Failed to create volume $catalog.$schema.$VolumeName: " +
                      s"HTTP ${response.status.code} — $respBody"
                  )
                )
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)

  // Generic GET helper

  private def get[A: JsonDecoder](
      url: String,
      token: String,
      client: Client
  ): IO[DatabricksError, A] =
    ZIO
      .scoped {
        client
          .request(
            Request
              .get(url)
              .addHeader("Authorization", s"Bearer $token")
          )
          .flatMap { response =>
            response.body.asString.flatMap { body =>
              response.status.code match
                case 401 | 403     =>
                  ZIO.fail(
                    DatabricksError.NotAuthenticated(
                      s"Databricks token is invalid or expired (HTTP ${response.status.code}). " +
                        s"Please log out and log in again with a valid access token."
                    )
                  )
                case c if c >= 400 =>
                  ZIO.fail(
                    DatabricksError.ApiCommunicationError(
                      s"Unity Catalog API error: HTTP $c — $body"
                    )
                  )
                case _             =>
                  ZIO.fromEither(
                    body
                      .fromJson[A]
                      .left
                      .map(err =>
                        DatabricksError.ApiCommunicationError(
                          s"Failed to parse response: $err — $body"
                        )
                      )
                  )
            }
          }
      }
      .mapError(DatabricksError.fromThrowable)

//JSON models

private case class CatalogEntry(name: String) derives JsonDecoder
private case class SchemaEntry(name: String) derives JsonDecoder
private case class VolumeEntry(name: String) derives JsonDecoder

private case class CatalogListResponse(catalogs: Option[List[CatalogEntry]]) derives JsonDecoder
private case class SchemaListResponse(schemas: Option[List[SchemaEntry]]) derives JsonDecoder
private case class VolumeListResponse(volumes: Option[List[VolumeEntry]]) derives JsonDecoder
