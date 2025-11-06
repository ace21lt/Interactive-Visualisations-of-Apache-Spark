package api

import service.DatabricksService
import models.NotebookOutput
import zio.*
import zio.http.*
import zio.json.*

// DTOs (Data Transfer Objects) for API responses

// Success response when notebook execution completes
case class TriggerResponse(runId: Long, state: String, output: Option[NotebookOutput])

object TriggerResponse:
  implicit val notebookOutputEncoder: JsonEncoder[NotebookOutput] = DeriveJsonEncoder.gen[NotebookOutput]
  implicit val encoder: JsonEncoder[TriggerResponse]              = DeriveJsonEncoder.gen[TriggerResponse]

// Error response with timestamp for debugging
case class ErrorResponse(error: String, timestamp: Long)

object ErrorResponse:
  implicit val encoder: JsonEncoder[ErrorResponse] = DeriveJsonEncoder.gen[ErrorResponse]

object Routes:

  // Simple API key validation (demo purposes only)
  // Production should use JWT, OAuth, or other proper auth
  private def validateRequest(request: Request): IO[Response, Unit] =
    request.headers.get("X-API-Key") match {
      case Some(value) if value.nonEmpty =>
        ZIO.unit // Valid key present
      case _                             =>
        // Missing or empty API key - return 401
        Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS).flatMap { timestamp =>
          ZIO.fail(
            Response
              .json(
                ErrorResponse(
                  error = "Authentication required. Please provide a valid X-API-Key header.",
                  timestamp = timestamp
                ).toJson
              )
              .status(Status.Unauthorized)
          )
        }
    }

  // HTTP routes definition
  def apply(): zio.http.Routes[DatabricksService, Response] =
    zio.http.Routes.fromIterable(
      Chunk(
        // POST /trigger - Submit notebook and return execution trace
        Method.POST / "trigger" -> handler { (request: Request) =>
          validateRequest(request) *> { // Check auth first
            DatabricksService
              .runNotebook()            // Execute notebook
              .map { result =>
                // Success - return run ID, state, and output as JSON
                val response = TriggerResponse(
                  runId = result.runId,
                  state = result.state,
                  output = result.output
                )
                Response.json(response.toJson)
              }
              .catchAll { error =>
                // Failure - log details internally, return generic error to user
                val errorMessage = Option(error.getMessage).getOrElse(error.toString)
                for {
                  _         <- ZIO.logError(s"Notebook execution failed: $errorMessage")
                  timestamp <- Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS)
                  response   = Response
                                 .json(
                                   ErrorResponse(
                                     error =
                                       s"Failed to execute notebook. Please verify: (1) DATABRICKS_HOST is correct and accessible, (2) DATABRICKS_TOKEN is valid and not expired, (3) NOTEBOOK_PATH exists and is accessible. Error details: $errorMessage",
                                     timestamp = timestamp
                                   ).toJson
                                 )
                                 .status(Status.InternalServerError)
                } yield response
              }
          }
        },
        // GET /health - Simple health check endpoint
        Method.GET / "health"   -> handler { (_: Request) =>
          ZIO.succeed(Response.text("OK"))
        }
      )
    )
