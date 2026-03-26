package api

import service.DatabricksError
import zio.http.*
import zio.json.*

// Maps DatabricksError to HTTP responses
object ErrorResponses:

  // Convert a DatabricksError to an HTTP response with appropriate status code
  def toResponse(error: DatabricksError, timestamp: Long): Response =
    val userMessage = error.toUserMessage
    val status      = error match
      case _: DatabricksError.ValidationError       => Status.BadRequest
      case _: DatabricksError.BadRequestError       => Status.BadRequest
      case _: DatabricksError.NotAuthenticated      => Status.Unauthorized
      case _: DatabricksError.ConfigError           => Status.BadRequest
      case _: DatabricksError.ApiCommunicationError => Status.BadGateway
      case e: DatabricksError.ApiResponseError      =>
        e.statusCode match
          case 401 | 403     => Status.Unauthorized
          case 404           => Status.NotFound
          case c if c >= 500 => Status.BadGateway
          case _             => Status.InternalServerError
      case _: DatabricksError.JsonParseError        => Status.InternalServerError
      case _: DatabricksError.ExecutionTimeout      => Status.RequestTimeout
      case _: DatabricksError.ExecutionFailed       => Status.UnprocessableEntity
      case _: DatabricksError.TaskNotFound          => Status.InternalServerError

    CorsHandler.addHeaders(
      Response
        .json(ErrorResponse(error = userMessage, timestamp = timestamp).toJson)
        .status(status)
    )
