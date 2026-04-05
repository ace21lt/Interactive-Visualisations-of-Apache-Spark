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

object Main extends ZIOAppDefault:

  // Build a Middleware.cors instance validated against the config allow-list.
  // In ZIO HTTP 3.0.0-RC4, Origin.Value carries scheme as a plain String
  // (e.g. "http", "https"), so we reconstruct the full origin directly.
  // With allowCredentials = true the origin MUST be reflected specifically —
  // a wildcard "*" is rejected by browsers on credentialed requests.
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

  override def run: URIO[Any, ExitCode] =
    (for
      cfg           <- ZIO.service[DatabricksConfig]
      corsMiddleware = buildCorsMiddleware(cfg.corsAllowedOrigins)
      _             <- ZIO.logInfo(s"CORS middleware active for origins: ${cfg.corsAllowedOrigins.mkString(", ")}")
      _             <- Server.serve((Routes.apply() @@ corsMiddleware).toHttpApp)
    yield ())
      .provide(
        // HTTP infrastructure
        Server.default,
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
