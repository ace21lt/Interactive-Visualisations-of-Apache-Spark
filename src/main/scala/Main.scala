import api.Routes
import config.DatabricksConfig
import service.{DatabricksService, DatabricksServiceLive}
import zio.*
import zio.http.*

// Main application entry point
object Main extends ZIOAppDefault:

  override def run: URIO[Any, ExitCode] =
    Server
      .serve(Routes().toHttpApp)
      .provide(
        Server.default, // Default ZIO HTTP server
        Client.default, // Default HTTP client for Databricks API calls
        DatabricksConfig.layer.mapError(msg => new RuntimeException(s"Configuration error: $msg")),
        DatabricksServiceLive.layer
      )
      .tapError(error => ZIO.logError(s"Application failed to start: ${error.getMessage}"))
      .exitCode
