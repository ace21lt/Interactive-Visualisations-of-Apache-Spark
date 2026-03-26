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

object RoutesSpec extends ZIOSpecDefault:

  // Test Response Model

  // Local model for parsing trigger response in tests
  private final case class TriggerResponse(runId: Long, state: String)
  private object TriggerResponse:
    given JsonDecoder[TriggerResponse] = DeriveJsonDecoder.gen[TriggerResponse]

  // Test Dependencies

  // Stub DatabricksService that returns a fixed successful response
  private val testDatabricksService: ZLayer[Any, Nothing, DatabricksService] =
    ZLayer.succeed(
      new DatabricksService:
        override def runLab(
            workspaceUrl: String,
            token: String,
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

  // Layer Composition

  // Compose all handler layers from their dependencies

  private val handlerLayers: ZLayer[Any, Nothing, LoginHandler & NotebookHandler & HealthHandler] =
    val baseLayer            =
      configLayerDirectDisabled ++ urlValidationStub ++ testDatabricksService ++ InMemorySessionManager.layer
    val credResolverLayer    = baseLayer >>> CredentialResolver.layer
    val loginHandlerLayer    = baseLayer >>> LoginHandler.layer
    val notebookHandlerLayer = (credResolverLayer ++ testDatabricksService) >>> NotebookHandler.layer
    val healthHandlerLayer   = HealthHandler.layer
    loginHandlerLayer ++ notebookHandlerLayer ++ healthHandlerLayer

  // Test Utilities

  private def app: HttpApp[LoginHandler & NotebookHandler & HealthHandler] = api.Routes.apply().toHttpApp

  // Extract session ID from Set-Cookie header
  private def extractSidCookie(resp: Response): Option[String] =
    resp.header(Header.SetCookie).flatMap { h =>
      h.renderedValue.split(';').headOption.flatMap { kv =>
        kv.split('=') match
          case Array(name, value) if name.trim == "sid" => Some(value.trim)
          case _                                        => None
      }
    }

  private val ValidWorkspaceUrl = "https://does-not-need-to-resolve.cloud.databricks.com"
  private val ValidToken        = "dapiTESTTOKEN-1234567890"

  // Test Suite

  override def spec: Spec[TestEnvironment & Scope, Any] =
    suite("Routes")(
      // Test complete login flow: login -> verify session with /api/me
      test("POST /api/login creates session; GET /api/me returns PAT mode info") {
        for
          // Step 1: Login with valid credentials
          loginReqBody <- ZIO.succeed(
                            Body.fromString(s"""{"workspaceUrl":"$ValidWorkspaceUrl","token":"$ValidToken"}""")
                          )
          loginResp    <- app.runZIO(
                            Request
                              .post(URL(Path("/api/login")), loginReqBody)
                              .addHeader(Header.ContentType(MediaType.application.json))
                          )
          // Fail fast if login didn't return 200
          _            <- ZIO
                            .fail(new RuntimeException(s"Expected 200, got ${loginResp.status}"))
                            .unless(loginResp.status == Status.Ok)
          // Extract session cookie from response
          sid          <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))

          // Step 2: Use session to check /api/me
          meResp <- app.runZIO(
                      Request
                        .get(URL(Path("/api/me")))
                        .addHeader(Header.Cookie(zio.NonEmptyChunk(Cookie.Request("sid", sid))))
                    )
          meBody <- meResp.body.asString
        yield
        // Verify: /api/me returns 200 with PAT mode indicator
        assert(meResp.status == Status.Ok && meBody.contains("\"mode\":\"pat\""))(isTrue)
      },

      // Verify /trigger endpoint requires authentication
      test("POST /trigger returns 401 without session cookie") {
        for resp <- app.runZIO(Request.post(URL(Path("/trigger")), Body.empty))
        yield assert(resp.status)(equalTo(Status.Unauthorized))
      },

      // Test complete flow: login -> trigger notebook -> verify response
      test("POST /trigger with valid session returns 200 with run details") {
        for
          // Step 1: Login to get session
          loginResp <- app.runZIO(
                         Request
                           .post(
                             URL(Path("/api/login")),
                             Body.fromString(s"""{"workspaceUrl":"$ValidWorkspaceUrl","token":"$ValidToken"}""")
                           )
                           .addHeader(Header.ContentType(MediaType.application.json))
                       )
          sid       <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))

          // Step 2: Trigger notebook with session cookie
          triggerResp <- app.runZIO(
                           Request
                             .post(URL(Path("/trigger")), Body.empty)
                             .addHeader(Header.Cookie(zio.NonEmptyChunk(Cookie.Request("sid", sid))))
                         )
          body        <- triggerResp.body.asString
          // Parse response to verify structure
          parsed       = body.fromJson[TriggerResponse]
        yield
        // Verify: 200 status and valid JSON response
        assert(triggerResp.status == Status.Ok && parsed.isRight)(isTrue)
      }
    ).provideSomeLayerShared(handlerLayers)
