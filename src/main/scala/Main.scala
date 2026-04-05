import api.Routes
import config.{DatabricksConfig, WorkspaceUrlValidation}
import credentials.CredentialResolver
import databricks.{DatasetProvisioner, JobStatusChecker, JobSubmitter, OutputFetcher, RetryPolicy, WorkspaceImporter}
import handlers.{HealthHandler, LoginHandler, NotebookHandler}
import service.DatabricksServiceLive
import session.InMemorySessionManager
import zio.*
import zio.http.*
import zio.http.Header.{
  AccessControlAllowCredentials,
  AccessControlAllowHeaders,
  AccessControlAllowMethods,
  AccessControlAllowOrigin,
  Origin
}
import zio.http.Middleware.{cors, CorsConfig}

import java.io.File
import java.nio.file.Paths

object Main extends ZIOAppDefault:

  locally {
    val lm = java.util.logging.LogManager.getLogManager
    lm.reset()
    java.util.logging.Logger.getLogger("").setLevel(java.util.logging.Level.SEVERE)
  }

  // Directory containing the React production build
  private val PublicDir = "/app/public"

  // Build a Middleware.cors instance validated against the config allow-list.
  private def buildCorsMiddleware(allowedOrigins: Set[String]) =
    cors(
      CorsConfig(
        allowedOrigin = {
          case origin @ Origin.Value(scheme, host, port) =>
            val portStr   = port.map(p => s":$p").getOrElse("")
            val originStr = s"$scheme://$host$portStr"
            if allowedOrigins.contains(originStr) then Some(AccessControlAllowOrigin.Specific(origin))
            else None
          case _                                         => None
        },
        allowedMethods = AccessControlAllowMethods(Method.GET, Method.POST, Method.OPTIONS),
        allowedHeaders = AccessControlAllowHeaders("Content-Type", "Authorization"),
        allowCredentials = AccessControlAllowCredentials.allow(true)
      )
    )

  // Content-type lookup for static files
  private def contentTypeFor(path: String): Header.ContentType =
    val ext = path.lastIndexOf('.') match
      case -1 => ""
      case i  => path.substring(i + 1).toLowerCase
    val mt  = ext match
      case "html"         => MediaType.text.html
      case "css"          => MediaType.text.css
      case "js"           => MediaType.application.javascript
      case "json"         => MediaType.application.json
      case "png"          => MediaType.image.png
      case "jpg" | "jpeg" => MediaType.image.jpeg
      case "gif"          => MediaType.image.gif
      case "svg"          => MediaType.image.`svg+xml`
      case "ico"          => MediaType.image.`x-icon`
      case "woff"         => MediaType.application.`font-woff`
      case "woff2"        => MediaType("font", "woff2")
      case "ttf"          => MediaType("font", "ttf")
      case "map"          => MediaType.application.json
      case "txt"          => MediaType.text.plain
      case "webmanifest"  => MediaType.application.json
      case _              => MediaType.application.`octet-stream`
    Header.ContentType(mt)

  // Serve a file from the public directory, or index.html as SPA fallback
  private def serveStaticFile(requestPath: String): ZIO[Any, Nothing, Response] =
    ZIO
      .attemptBlocking {
        // Normalise and prevent path traversal
        val sanitised  = requestPath.stripPrefix("/").replaceAll("\\.\\.", "")
        val targetPath = Paths.get(PublicDir, sanitised).normalize()

        // Ensure resolved path is still within PublicDir
        if !targetPath.startsWith(Paths.get(PublicDir).normalize()) then Response.status(Status.Forbidden)
        else
          val file = targetPath.toFile
          if file.exists() && file.isFile then
            Response(
              status = Status.Ok,
              headers = Headers(contentTypeFor(file.getName)),
              body = Body.fromFile(file)
            )
          else
            // SPA fallback: serve index.html for unmatched routes
            val indexFile = new File(s"$PublicDir/index.html")
            if indexFile.exists() then
              Response(
                status = Status.Ok,
                headers = Headers(Header.ContentType(MediaType.text.html)),
                body = Body.fromFile(indexFile)
              )
            else Response.status(Status.NotFound)
      }
      .orElse(ZIO.succeed(Response.status(Status.InternalServerError)))

  // Static file routes — catch-all, placed AFTER API routes
  private val staticRoutes: zio.http.Routes[Any, Response] =
    zio.http.Routes(
      Method.GET / trailing -> handler { (path: Path, _: Request) =>
        serveStaticFile(path.encode)
      }
    )

  override def run: URIO[Any, ExitCode] =
    (for
      cfg           <- ZIO.service[DatabricksConfig]
      corsMiddleware = buildCorsMiddleware(cfg.corsAllowedOrigins)

      // Read PORT from environment (Railway injects this)
      port <- ZIO
                .attempt(scala.sys.env.getOrElse("PORT", "8080").toInt)
                .orElse(ZIO.succeed(8080))

      _ <- ZIO.logInfo(s"CORS middleware active for origins: ${cfg.corsAllowedOrigins.mkString(", ")}")
      _ <- ZIO.logInfo(s"Starting server on port $port")
      _ <- ZIO.logInfo(s"Serving static files from $PublicDir")

      // 1. Define base routes (API + Static)
      baseRoutes = (Routes.apply() ++ staticRoutes) @@ corsMiddleware

      // 2. Apply password protection if configured
      protectedRoutes = scala.sys.env.get("DEV_PASSWORD") match {
                          case Some(pwd) if pwd.nonEmpty =>
                            baseRoutes @@ Middleware.basicAuth { credentials =>
                              credentials.uname == "admin" && credentials.upassword == pwd
                            }
                          case _                         =>
                            baseRoutes
                        }

      // 3. Create an UNPROTECTED health route for Railway
      healthRoute     = zio.http.Routes(
                          Method.GET / "health" -> handler { (req: Request) =>
                            ZIO.serviceWithZIO[HealthHandler](_.health(req))
                          }
                        )

      allRoutes = healthRoute ++ protectedRoutes

      _ <- Server.serve(allRoutes.toHttpApp)
    yield ())
      .provide(
        // HTTP infrastructure — bind to configured port
        ZLayer.fromZIO(
          ZIO
            .attempt(scala.sys.env.getOrElse("PORT", "8080").toInt)
            .orElse(ZIO.succeed(8080))
            .map(port =>
              Server.Config.default
                .port(port)
                .idleTimeout(5.minutes)
            )
        ) >>> Server.live,
        Client.default,

        // Configuration
        ZLayer.succeed(WorkspaceUrlValidation.live),
        DatabricksConfig.layer.mapError(msg => new RuntimeException(s"Configuration error: $msg")),

        // Session management
        InMemorySessionManager.layer,

        // Credential resolution
        CredentialResolver.layer,

        // Databricks components
        RetryPolicy.layer,
        JobSubmitter.layer,
        JobStatusChecker.layer,
        OutputFetcher.layer,
        WorkspaceImporter.layer,
        DatasetProvisioner.layer,
        DatabricksServiceLive.layer,

        // Request handlers
        LoginHandler.layer,
        NotebookHandler.layer,
        HealthHandler.layer
      )
      .tapError(error => ZIO.logError(s"Application failed to start: ${error.getMessage}"))
      .exitCode
