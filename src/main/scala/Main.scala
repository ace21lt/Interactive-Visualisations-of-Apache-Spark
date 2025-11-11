import api.Routes
import config.DatabricksConfig
import service.{DatabricksService, DatabricksServiceLive}
import zio.*
import zio.http.*

// Main application entry point
// Backend skeleton for my dissertation: "Interactive Visualisations of Apache Spark"
// This demo shows Scala → Databricks REST API → JSON trace → (future: React/D3.js)
object Main extends ZIOAppDefault:

  override def run: URIO[Any, ExitCode] =
    Server
      .serve(Routes().toHttpApp) // Start HTTP server with our routes
      .provide(
        Server.default,             // Default ZIO HTTP server (port 8080)
        Client.default,             // Default HTTP client for Databricks API calls
        // Load config from env vars, fail fast if misconfigured
        DatabricksConfig.layer.mapError(msg => new RuntimeException(s"Configuration error: $msg")),
        DatabricksServiceLive.layer // Wire up Databricks service implementation
      )
      .tapError(error => ZIO.logError(s"Application failed to start: ${error.getMessage}"))
      .exitCode                  // Return exit code (0 = success, non-zero = failure)
