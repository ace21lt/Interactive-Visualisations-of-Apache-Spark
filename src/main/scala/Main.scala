import api.Routes
import config.{DatabricksConfig, WorkspaceUrlValidation}
import credentials.CredentialResolver
import databricks.{DatasetProvisioner, JobStatusChecker, JobSubmitter, OutputFetcher, RetryPolicy, WorkspaceImporter}
import handlers.{HealthHandler, LoginHandler, NotebookHandler}
import service.DatabricksServiceLive
import session.InMemorySessionManager
import zio.*
import zio.http.*

object Main extends ZIOAppDefault:

  override def run: URIO[Any, ExitCode] =
    Server
      .serve(Routes.apply().toHttpApp)
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
        DatasetProvisioner.layer, // uploads datasets to student workspace
        DatabricksServiceLive.layer,

        // Request handlers
        LoginHandler.layer,
        NotebookHandler.layer,
        HealthHandler.layer
      )
      .tapError(error => ZIO.logError(s"Application failed to start: ${error.getMessage}"))
      .exitCode
