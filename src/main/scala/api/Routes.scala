package api

import service.{DatabricksError, DatabricksService}
import models.NotebookOutput
import zio.*
import zio.http.*
import zio.json.*

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

  // HTTP routes definition
  def apply(): zio.http.Routes[DatabricksService, Response] =
    zio.http.Routes.fromIterable(
      Chunk(
        Method.POST / "trigger"    -> handler { (_: Request) =>
          DatabricksService
            .runNotebook()
            .map { result =>
              val response = TriggerResponse(
                runId = result.runId,
                state = result.state,
                output = result.output
              )
              addCorsHeaders(Response.json(response.toJson))
            }
            .catchAll { (error: DatabricksError) =>
              // Log the technical error message
              ZIO.logError(s"Notebook execution failed: ${error.getMessage}") *>
                Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS).map { timestamp =>
                  // Return user-friendly error message
                  val userMessage = error.toUserMessage

                  // Map error types to appropriate HTTP status codes
                  val status = error match {
                    case _: DatabricksError.ConfigError           => Status.BadRequest
                    case _: DatabricksError.ApiCommunicationError => Status.BadGateway
                    case e: DatabricksError.ApiResponseError      =>
                      e.statusCode match {
                        case 401 | 403     => Status.Unauthorized
                        case 404           => Status.NotFound
                        case c if c >= 500 => Status.BadGateway
                        case _             => Status.InternalServerError
                      }
                    case _: DatabricksError.JsonParseError        => Status.InternalServerError
                    case _: DatabricksError.ExecutionTimeout      => Status.RequestTimeout
                    case _: DatabricksError.ExecutionFailed       => Status.InternalServerError
                    case _: DatabricksError.TaskNotFound          => Status.InternalServerError
                  }

                  addCorsHeaders(
                    Response
                      .json(ErrorResponse(error = userMessage, timestamp = timestamp).toJson)
                      .status(status)
                  )
                }
            }
        },
        Method.GET / "health"      -> handler { (_: Request) =>
          ZIO.succeed(addCorsHeaders(Response.text("OK")))
        },
        // OPTIONS for CORS preflight
        Method.OPTIONS / "trigger" -> handler { (_: Request) =>
          ZIO.succeed(
            Response
              .status(Status.NoContent)
              .addHeader("Access-Control-Allow-Origin", "http://localhost:3000")
              .addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
              .addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
              .addHeader("Access-Control-Max-Age", "86400")
          )
        }
      )
    )
