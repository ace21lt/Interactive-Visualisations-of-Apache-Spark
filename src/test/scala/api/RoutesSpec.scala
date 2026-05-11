package api

import config.{DatabricksConfig, WorkspaceUrlValidation}
import config.WorkspaceUrlValidationStub
import credentials.CredentialResolver
import handlers.{HealthHandler, LoginHandler, NotebookHandler}
import service.{DatabricksError, DatabricksService}
import session.InMemorySessionManager
import zio.*
import zio.http.*
import zio.json.*
import zio.test.*
import zio.test.Assertion.*

import api.TestAuthHelpers.*

object RoutesSpec extends ZIOSpecDefault:

  // Local model for parsing trigger response in tests
  private final case class TriggerResponse(runId: Long, state: String)
  private object TriggerResponse:
    given JsonDecoder[TriggerResponse] = DeriveJsonDecoder.gen[TriggerResponse]

  // Stub DatabricksService that returns a fixed successful response
  private val testDatabricksService: ZLayer[Any, Nothing, DatabricksService] =
    ZLayer.succeed(
      new DatabricksService:
        override def runLab(
            workspaceUrl: String,
            token: String,
            lab: String = "lab1",
            step: Option[Int] = None,
            editedCode: Option[String] = None
        ): IO[DatabricksError, models.RunOutput] =
          ZIO.succeed(models.RunOutput(runId = 123L, state = "SUCCESS", output = None))
    )

  // Config with direct mode disabled (no env credentials)
  // Forces users to authenticate via /api/login
  private def configLayerDirectDisabled: ZLayer[Any, Nothing, DatabricksConfig] =
    ZLayer.succeed(
      DatabricksConfig(
        workspaceUrl = None,
        token = None
      )
    )

  // Stub URL validator that accepts all URLs for happy path testing
  private val urlValidationStub: ZLayer[Any, Nothing, WorkspaceUrlValidation] =
    WorkspaceUrlValidationStub.acceptAll("https://dbc-test.cloud.databricks.com")

  private val handlerLayers: ZLayer[Any, Nothing, LoginHandler & NotebookHandler & HealthHandler] =
    val baseLayer            =
      configLayerDirectDisabled ++ urlValidationStub ++ testDatabricksService ++ InMemorySessionManager.layer
    val credResolverLayer    = baseLayer >>> CredentialResolver.layer
    val loginHandlerLayer    = baseLayer >>> LoginHandler.layer
    val notebookHandlerLayer =
      (configLayerDirectDisabled ++ credResolverLayer ++ testDatabricksService) >>> NotebookHandler.layer
    val healthHandlerLayer   = HealthHandler.layer
    loginHandlerLayer ++ notebookHandlerLayer ++ healthHandlerLayer

  private def app: HttpApp[LoginHandler & NotebookHandler & HealthHandler] = api.Routes.apply().toHttpApp

  private val ValidWorkspaceUrl = "https://does-not-need-to-resolve.cloud.databricks.com"
  private val ValidToken        = "dapiTESTTOKEN-1234567890"

  override def spec: Spec[TestEnvironment & Scope, Any] =
    suite("Routes")(
      test("POST /api/login creates session; GET /api/me returns PAT mode info") {
        for
          loginResp <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
          _         <- ZIO
                         .fail(new RuntimeException(s"Expected 200, got ${loginResp.status}"))
                         .unless(loginResp.status == Status.Ok)
          sid       <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))

          meResp <- app.runZIO(
                      Request
                        .get(URL(Path("/api/me")))
                        .addHeader(cookieHeader(sid))
                    )
          meBody <- meResp.body.asString
        yield assert(meResp.status == Status.Ok && meBody.contains("\"mode\":\"pat\""))(isTrue)
      },
      test("POST /trigger returns 401 without session cookie") {
        for resp <- app.runZIO(Request.post(URL(Path("/trigger")), Body.empty))
        yield assert(resp.status)(equalTo(Status.Unauthorized))
      },
      test("POST /trigger with valid session returns 200 with run details") {
        for
          loginResp <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
          sid       <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))

          triggerResp <- app.runZIO(
                           Request
                             .post(URL(Path("/trigger")), Body.empty)
                             .addHeader(cookieHeader(sid))
                         )
          body        <- triggerResp.body.asString
          parsed       = body.fromJson[TriggerResponse]
        yield assert(triggerResp.status == Status.Ok && parsed.isRight)(isTrue)
      }
    ).provideSomeLayerShared(handlerLayers)
