package databricks

import service.DatabricksError
import zio.*
import zio.http.*
import zio.json.*

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

// Discover a writable Unity Catalog volume path for datasets.
object CatalogDiscovery:

  private val SystemCatalogs = Set(
    "system",
    "hive_metastore",
    "samples",
    "__databricks_internal",
    "databricks_marketplace"
  )

  private val VolumeName = "sparkml_tmp"

  private def encodeQueryParam(value: String): String =
    URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")

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

  private def findFirstSchema(
      workspaceUrl: String,
      token: String,
      client: Client,
      catalog: String
  ): IO[DatabricksError, String] =
    val url =
      s"${workspaceUrl.stripSuffix("/")}/api/2.1/unity-catalog/schemas?catalog_name=${encodeQueryParam(catalog)}"
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

  private def ensureVolume(
      workspaceUrl: String,
      token: String,
      client: Client,
      catalog: String,
      schema: String
  ): IO[DatabricksError, Unit] =
    val listUrl = s"${workspaceUrl.stripSuffix("/")}/api/2.1/unity-catalog/volumes" +
      s"?catalog_name=${encodeQueryParam(catalog)}&schema_name=${encodeQueryParam(schema)}"
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
    val body = CreateVolumeRequest(
      catalogName = catalog,
      schemaName = schema,
      name = VolumeName,
      volumeType = "MANAGED"
    ).toJson
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
                case 401           =>
                  ZIO.fail(
                    DatabricksError.NotAuthenticated(
                      s"Databricks token is invalid or expired (HTTP 401). " +
                        s"Please log out and log in again with a valid access token."
                    )
                  )
                case 403           =>
                  ZIO.fail(
                    DatabricksError.InsufficientPermissions(
                      s"Access denied to Unity Catalog API (HTTP 403). " +
                        s"Please ensure your Databricks token has the necessary API Scope of jobs, workspace, files, unity-catalog and clusters, " +
                        s"and that your Databricks workspace has a writable catalog and schema available."
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

// JSON models for Unity Catalog API responses

private case class CatalogEntry(name: String) derives JsonDecoder
private case class SchemaEntry(name: String) derives JsonDecoder
private case class VolumeEntry(name: String) derives JsonDecoder

private case class CreateVolumeRequest(
    @zio.json.jsonField("catalog_name") catalogName: String,
    @zio.json.jsonField("schema_name") schemaName: String,
    name: String,
    @zio.json.jsonField("volume_type") volumeType: String
) derives JsonEncoder

private case class CatalogListResponse(catalogs: Option[List[CatalogEntry]]) derives JsonDecoder
private case class SchemaListResponse(schemas: Option[List[SchemaEntry]]) derives JsonDecoder
private case class VolumeListResponse(volumes: Option[List[VolumeEntry]]) derives JsonDecoder
