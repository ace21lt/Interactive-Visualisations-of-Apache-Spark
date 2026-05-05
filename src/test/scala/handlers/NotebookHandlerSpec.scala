package handlers

import config.DatabricksConfig
import credentials.CredentialResolver
import service.{DatabricksError, DatabricksService}
import zio.*
import zio.http.*
import zio.test.*
import zio.test.Assertion.*

object NotebookHandlerSpec extends ZIOSpecDefault:

  // A default config sufficient for handler unit tests; secureCookies = false
  // means no Secure flag on any cleared cookies, which is fine for HTTP test requests.
  private val testConfig = DatabricksConfig()

  // Mock implementations for testing
  case class FailingCredentialResolver(error: DatabricksError) extends CredentialResolver:
    override def getCredentials(req: Request): IO[DatabricksError, (String, String)] =
      ZIO.fail(error)

  case class SuccessfulCredentialResolver(url: String, token: String) extends CredentialResolver:
    override def getCredentials(req: Request): IO[DatabricksError, (String, String)] =
      ZIO.succeed((url, token))

  case class FailingDatabricksService(error: DatabricksError) extends DatabricksService:
    override def runLab(
        workspaceUrl: String,
        token: String,
        lab: String = "lab1",
        step: Option[Int] = None,
        editedCode: Option[String] = None
    ): IO[DatabricksError, models.RunOutput] =
      ZIO.fail(error)

  case class SuccessfulDatabricksService() extends DatabricksService:
    override def runLab(
        workspaceUrl: String,
        token: String,
        lab: String = "lab1",
        step: Option[Int] = None,
        editedCode: Option[String] = None
    ): IO[DatabricksError, models.RunOutput] =
      ZIO.succeed(models.RunOutput(runId = 123L, state = "SUCCESS", output = None))

  override def spec: Spec[TestEnvironment, Any] =
    suite("NotebookHandler")(
      // Error path: not authenticated
      test("returns 401 Unauthorized when credentials resolver fails with NotAuthenticated") {
        val handler = NotebookHandlerLive(
          testConfig,
          FailingCredentialResolver(DatabricksError.NotAuthenticated()),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.Unauthorized))
      },
      test("returns JSON error body when not authenticated") {
        val handler = NotebookHandlerLive(
          testConfig,
          FailingCredentialResolver(DatabricksError.NotAuthenticated()),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for
          response <- handler.trigger(request)
          body     <- response.body.asString
        yield assert(body)(containsString("Not authenticated")) &&
          assert(body)(containsString("\"error\""))
      },
      test("clears sid cookie in 401 response when not authenticated") {
        val handler = NotebookHandlerLive(
          testConfig,
          FailingCredentialResolver(DatabricksError.NotAuthenticated()),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(
          response.headers.exists(h =>
            h.headerName.equalsIgnoreCase("set-cookie") &&
              h.renderedValue.contains("sid=") &&
              h.renderedValue.contains("Max-Age=0")
          )
        )(isTrue)
      },

      // Error path: Databricks service failure
      test("handles Databricks API communication error") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          FailingDatabricksService(DatabricksError.ApiCommunicationError("Connection timeout"))
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.BadGateway))
      },
      test("handles Databricks API response error (401)") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          FailingDatabricksService(DatabricksError.ApiResponseError(401, "Unauthorized"))
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.Unauthorized))
      },
      test("handles execution timeout error") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          FailingDatabricksService(
            DatabricksError.ExecutionTimeout(runId = 123L, maxAttempts = 30, pollInterval = 2)
          )
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.RequestTimeout))
      },
      test("handles execution failed error") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          FailingDatabricksService(
            DatabricksError.ExecutionFailed(
              runId = 123L,
              state = "TERMINATED",
              stateMessage = Some("Cell execution failed")
            )
          )
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.UnprocessableEntity))
      },

      // Happy path: successful execution
      test("returns 200 with run details on successful execution") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.Ok))
      },
      test("response contains valid JSON with run details") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for
          response <- handler.trigger(request)
          body     <- response.body.asString
        yield assert(response.status)(equalTo(Status.Ok)) &&
          assert(body.contains("\"runId\""))(isTrue) &&
          assert(body.contains("\"state\":\"SUCCESS\""))(isTrue)
      },

      // Edge cases
      test("handles empty request body (uses default TriggerRequest)") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.empty)
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.Ok))
      },
      test("returns 400 for malformed JSON in request body") {
        val handler = NotebookHandlerLive(
          testConfig,
          SuccessfulCredentialResolver("https://test.databricks.com", "dapiTOKEN-123"),
          SuccessfulDatabricksService()
        )
        val request = Request.post(URL(Path("/trigger")), Body.fromString("{not-json}"))
        for response <- handler.trigger(request)
        yield assert(response.status)(equalTo(Status.BadRequest))
      }
    )
