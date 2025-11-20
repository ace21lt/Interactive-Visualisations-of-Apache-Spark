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

  // Add CORS headers to all responses to allow frontend (localhost:3000) to call backend API
  private def addCorsHeaders(response: Response): Response =
    response
      .addHeader("Access-Control-Allow-Origin", "http://localhost:3000")
      .addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      .addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  // HTTP routes definition - no authentication needed for single-user demo
  def apply(): zio.http.Routes[DatabricksService, Response] =
    zio.http.Routes.fromIterable(
      Chunk(
        // POST /trigger - Submit notebook and return execution trace
        Method.POST / "trigger" -> handler { (_: Request) =>
          DatabricksService
            .runNotebook() // Execute notebook
            .map { result =>
              // Success - return run ID, state, and output as JSON
              val response = TriggerResponse(
                runId = result.runId,
                state = result.state,
                output = result.output
              )
              addCorsHeaders(Response.json(response.toJson))
            }
            .catchAll { error =>
              // Failure - log details internally, return generic error to user
              val errorMessage = Option(error.getMessage).getOrElse(error.toString)
              for {
                _         <- ZIO.logError(s"Notebook execution failed: $errorMessage")
                timestamp <- Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS)
                response   = addCorsHeaders(
                               Response
                                 .json(
                                   ErrorResponse(
                                     error =
                                       "Failed to execute notebook. Please verify: (1) DATABRICKS_HOST is correct and accessible, (2) DATABRICKS_TOKEN is valid and not expired, (3) NOTEBOOK_PATH exists and is accessible.",
                                     timestamp = timestamp
                                   ).toJson
                                 )
                                 .status(Status.InternalServerError)
                             )
              } yield response
            }
        },
        // GET /health - Simple health check endpoint
        Method.GET / "health"   -> handler { (_: Request) =>
          ZIO.succeed(addCorsHeaders(Response.text("OK")))
        },
        // OPTIONS for CORS preflight
        Method.OPTIONS / "trigger" -> handler { (_: Request) =>
          ZIO.succeed(
            Response.status(Status.NoContent)
              .addHeader("Access-Control-Allow-Origin", "http://localhost:3000")
              .addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
              .addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
              .addHeader("Access-Control-Max-Age", "86400")
          )
        }
      )
    )
