package api

import service.DatabricksError
import zio.http.*
import zio.test.*
import zio.test.Assertion.*

object ErrorResponsesSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("ErrorResponses")(
      // ValidationError -> 400
      test("maps ValidationError to 400 BadRequest") {
        val error    = DatabricksError.ValidationError("Invalid URL format")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.BadRequest))
      },

      // BadRequestError -> 400
      test("maps BadRequestError to 400 BadRequest") {
        val error    = DatabricksError.BadRequestError("Missing required field")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.BadRequest))
      },

      // NotAuthenticated -> 401
      test("maps NotAuthenticated to 401 Unauthorized") {
        val error    = DatabricksError.NotAuthenticated("Session expired")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.Unauthorized))
      },

      // ConfigError -> 400
      test("maps ConfigError to 400 BadRequest") {
        val error    = DatabricksError.ConfigError("Missing DATABRICKS_TOKEN")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.BadRequest))
      },

      // ApiCommunicationError -> 502
      test("maps ApiCommunicationError to 502 BadGateway") {
        val error    = DatabricksError.ApiCommunicationError("Connection timeout")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.BadGateway))
      },

      // ApiResponseError 401 -> 401
      test("maps ApiResponseError 401 to 401 Unauthorized") {
        val error    = DatabricksError.ApiResponseError(401, "Unauthorized")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.Unauthorized))
      },

      // ApiResponseError 403 -> 401
      test("maps ApiResponseError 403 to 403 Forbidden") {
        val error    = DatabricksError.ApiResponseError(403, "Forbidden")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.Forbidden))
      },

      // InsufficientPermissions -> 403
      test("maps InsufficientPermissions to 403 Forbidden") {
        val error    = DatabricksError.InsufficientPermissions("Access denied")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.Forbidden))
      },

      // ApiResponseError 404 -> 404
      test("maps ApiResponseError 404 to 404 NotFound") {
        val error    = DatabricksError.ApiResponseError(404, "Not found")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.NotFound))
      },

      // ApiResponseError 5xx -> 502
      test("maps ApiResponseError 500 to 502 BadGateway") {
        val error    = DatabricksError.ApiResponseError(500, "Internal server error")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.BadGateway))
      },
      test("maps ApiResponseError 503 to 502 BadGateway") {
        val error    = DatabricksError.ApiResponseError(503, "Service unavailable")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.BadGateway))
      },

      // ApiResponseError other 4xx -> 500
      test("maps ApiResponseError 400 to 500 InternalServerError") {
        val error    = DatabricksError.ApiResponseError(400, "Bad request from API")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.InternalServerError))
      },

      // JsonParseError -> 500
      test("maps JsonParseError to 500 InternalServerError") {
        val error    = DatabricksError.JsonParseError("Unexpected JSON structure", Some("""{"invalid": }"""))
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.InternalServerError))
      },

      // ExecutionTimeout -> 408
      test("maps ExecutionTimeout to 408 RequestTimeout") {
        val error    = DatabricksError.ExecutionTimeout(12345L, 30, 2)
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.RequestTimeout))
      },

      // ExecutionFailed -> 422
      test("maps ExecutionFailed to 422 UnprocessableEntity") {
        val error    = DatabricksError.ExecutionFailed(12345L, "TERMINATED", Some("Task failed"))
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.UnprocessableEntity))
      },

      // TaskNotFound -> 500
      test("maps TaskNotFound to 500 InternalServerError") {
        val error    = DatabricksError.TaskNotFound(12345L, "No task found in job")
        val response = ErrorResponses.toResponse(error, System.currentTimeMillis())
        assert(response.status)(equalTo(Status.InternalServerError))
      },

      // Response is JSON with error message
      test("response contains JSON with error and timestamp") {
        val error    = DatabricksError.BadRequestError("Test error")
        val ts       = System.currentTimeMillis()
        val response = ErrorResponses.toResponse(error, ts)
        for
          body        <- response.body.asString
          hasError     = body.contains("\"error\"")
          hasTimestamp = body.contains("\"timestamp\"")
        yield assert(hasError && hasTimestamp)(isTrue)
      }
    )
