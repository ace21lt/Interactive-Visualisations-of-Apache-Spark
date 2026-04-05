package api
import config.{DatabricksConfig, WorkspaceUrlValidation, WorkspaceUrlValidator}
import config.WorkspaceUrlValidationStub
import credentials.CredentialResolver
import handlers.{HealthHandler, LoginHandler, NotebookHandler}
import service.{DatabricksError, DatabricksService}
import session.InMemorySessionManager
import zio.*
import zio.http.*
import zio.test.*
import zio.test.Assertion.*

import java.net.InetAddress

object LoginLogoutSpec extends ZIOSpecDefault:

  // Test Dependencies (Stubs and Mocks)

  // Stub DatabricksService that always returns success
  private val testDatabricksService: ZLayer[Any, Nothing, DatabricksService] =
    ZLayer.succeed(
      new DatabricksService:
        override def runLab(
            workspaceUrl: String,
            token: String,
            step: Option[Int] = None,
            editedCode: Option[String] = None
        ): IO[DatabricksError, models.RunOutput] =
          ZIO.succeed(models.RunOutput(runId = 1L, state = "SUCCESS", output = None))
    )

  // Config for PAT session mode (no direct credentials) — notebookPath removed, defaults apply
  private val configLayerPatMode: ZLayer[Any, Nothing, DatabricksConfig] =
    ZLayer.succeed(DatabricksConfig(workspaceUrl = None, token = None))

  // Config for direct mode (credentials in environment) — notebookPath removed, defaults apply
  private val configLayerDirectMode: ZLayer[Any, Nothing, DatabricksConfig] =
    ZLayer.succeed(
      DatabricksConfig(
        workspaceUrl = Some("https://dbc-c91b1745-f6cc.cloud.databricks.com"),
        token = Some("dapiDIRECTTOKEN-1234567890")
      )
    )

  // Mock DNS resolver for URL validation tests
  private val dnsPublicOnly: WorkspaceUrlValidator.DnsResolver = new WorkspaceUrlValidator.DnsResolver:
    override def resolveAll(host: String) = Right(List(InetAddress.getByName("8.8.8.8")))

  // Real URL validator with mock DNS (for testing validation errors)
  private val urlValidationReal: ZLayer[Any, Nothing, WorkspaceUrlValidation] =
    ZLayer.succeed(
      new WorkspaceUrlValidation:
        override def validate(url: String): Either[DatabricksError.ValidationError, String] =
          WorkspaceUrlValidator.validate(url, dnsPublicOnly)
    )

  // Stub URL validator that accepts all URLs (for happy path tests)
  private val urlValidationStub: ZLayer[Any, Nothing, WorkspaceUrlValidation] =
    WorkspaceUrlValidationStub.acceptAll("https://dbc-test.cloud.databricks.com")

  // Layer Composition

  // Build all handler layers from base dependencies
  private def handlerLayers(
      configLayer: ZLayer[Any, Nothing, DatabricksConfig],
      urlValidationLayer: ZLayer[Any, Nothing, WorkspaceUrlValidation]
  ): ZLayer[Any, Nothing, LoginHandler & NotebookHandler & HealthHandler] =
    val baseLayer            = configLayer ++ urlValidationLayer ++ testDatabricksService ++ InMemorySessionManager.layer
    val credResolverLayer    = baseLayer >>> CredentialResolver.layer
    val loginHandlerLayer    = baseLayer >>> LoginHandler.layer
    val notebookHandlerLayer = (configLayer ++ credResolverLayer ++ testDatabricksService) >>> NotebookHandler.layer
    val healthHandlerLayer   = HealthHandler.layer
    loginHandlerLayer ++ notebookHandlerLayer ++ healthHandlerLayer

  // Pre-built layer configurations for different test scenarios
  private val patEnv               = handlerLayers(configLayerPatMode, urlValidationStub)
  private val patEnvRealValidation = handlerLayers(configLayerPatMode, urlValidationReal)
  private val directModeEnv        = handlerLayers(configLayerDirectMode, urlValidationStub)

  // Test Utilities

  private val app: HttpApp[LoginHandler & NotebookHandler & HealthHandler] = api.Routes.apply().toHttpApp

  // Valid test credentials that pass validation
  private val ValidWorkspaceUrl = "https://dbc-DOES-NOT-NEED-TO-RESOLVE.cloud.databricks.com"
  private val ValidToken        = "dapiTESTTOKEN-1234567890"

  private def json(body: String): Body = Body.fromString(body)

  // Extract session ID from Set-Cookie header
  private def extractSidCookie(resp: Response): Option[String] =
    resp.header(Header.SetCookie).flatMap { h =>
      h.renderedValue.split(';').headOption.flatMap { kv =>
        kv.split('=') match
          case Array(name, value) if name.trim == "sid" => Some(value.trim)
          case _                                        => None
      }
    }

  // Build Cookie header for authenticated requests
  private def cookieHeader(sid: String): Header.Cookie =
    Header.Cookie(zio.NonEmptyChunk(Cookie.Request("sid", sid)))

  // Helper to create login request with JSON body
  private def loginRequest(workspaceUrl: String, token: String): Request =
    Request
      .post(URL(Path("/api/login")), json(s"""{"workspaceUrl":"$workspaceUrl","token":"$token"}"""))
      .addHeader(Header.ContentType(MediaType.application.json))

  // Test Suites

  override def spec: Spec[TestEnvironment & Scope, Any] =
    suite("Login/logout")(
      loginPatModeTests,
      meEndpointTests,
      logoutEndpointTests,
      loginDirectModeTests
    )

  // Tests for POST /api/login in PAT session mode
  private val loginPatModeTests = suite("/api/login (PAT session mode)")(
    // Happy path: valid credentials should return 200 with session cookie
    test("returns 200 and sets sid cookie for valid credentials") {
      for
        resp <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
        sid  <- ZIO.fromOption(extractSidCookie(resp)).orElseFail(new RuntimeException("sid cookie missing"))
      yield assert(resp.status)(equalTo(Status.Ok)) &&
        assertTrue(sid.nonEmpty)
    }.provideSomeLayerShared(patEnv),

    // Invalid JSON should return 400 Bad Request
    test("returns 400 for malformed JSON body") {
      for resp <- app.runZIO(
                    Request
                      .post(URL(Path("/api/login")), json("{not-json"))
                      .addHeader(Header.ContentType(MediaType.application.json))
                  )
      yield assert(resp.status)(equalTo(Status.BadRequest))
    }.provideSomeLayerShared(patEnv),

    // Empty workspace URL should fail validation
    test("returns 400 when workspaceUrl is empty") {
      for resp <- app.runZIO(loginRequest("", ValidToken))
      yield assert(resp.status)(equalTo(Status.BadRequest))
    }.provideSomeLayerShared(patEnvRealValidation),

    // HTTP URLs should be rejected (HTTPS required for security)
    test("returns 400 for non-HTTPS workspace URL") {
      for resp <- app.runZIO(loginRequest("http://dbc-c91b1745-f6cc.cloud.databricks.com", ValidToken))
      yield assert(resp.status)(equalTo(Status.BadRequest))
    }.provideSomeLayerShared(patEnvRealValidation),

    // Only *.databricks.com domains allowed
    test("returns 400 for non-Databricks domain") {
      for resp <- app.runZIO(loginRequest("https://example.com", ValidToken))
      yield assert(resp.status)(equalTo(Status.BadRequest))
    }.provideSomeLayerShared(patEnvRealValidation),

    // Localhost blocked to prevent SSRF to internal services
    test("returns 400 for localhost URL") {
      for resp <- app.runZIO(loginRequest("https://localhost", ValidToken))
      yield assert(resp.status)(equalTo(Status.BadRequest))
    }.provideSomeLayerShared(patEnvRealValidation),

    // Token must match Databricks PAT format (dapi...)
    test("returns 400 for invalid token format") {
      for resp <- app.runZIO(loginRequest(ValidWorkspaceUrl, "not-a-valid-token"))
      yield assert(resp.status)(equalTo(Status.BadRequest))
    }.provideSomeLayerShared(patEnv)
  )

  // Tests for GET /api/me endpoint (authentication status check)
  private val meEndpointTests = suite("/api/me")(
    // No cookie = not authenticated
    test("returns 401 without session cookie") {
      for resp <- app.runZIO(Request.get(URL(Path("/api/me"))))
      yield assert(resp.status)(equalTo(Status.Unauthorized))
    },

    // Valid session should return user info with 200
    test("returns 200 with valid session cookie") {
      for
        loginResp <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
        sid       <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))
        meResp    <- app.runZIO(Request.get(URL(Path("/api/me"))).addHeader(cookieHeader(sid)))
      yield assert(meResp.status)(equalTo(Status.Ok))
    },

    // Unknown session ID should be rejected
    test("returns 401 for unknown session ID") {
      for meResp <- app.runZIO(Request.get(URL(Path("/api/me"))).addHeader(cookieHeader("unknownsid")))
      yield assert(meResp.status)(equalTo(Status.Unauthorized))
    }
  ).provideSomeLayerShared(patEnv)

  // Tests for POST /api/logout endpoint
  private val logoutEndpointTests = suite("/api/logout")(
    // Logout without session should still return 204
    test("returns 204 even without session cookie") {
      for resp <- app.runZIO(Request.post(URL(Path("/api/logout")), Body.empty))
      yield assert(resp.status)(equalTo(Status.NoContent))
    },

    // Logout should invalidate the session - verify with /api/me
    test("invalidates session so subsequent /api/me returns 401") {
      for
        loginResp <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
        sid       <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))
        _         <- app.runZIO(Request.post(URL(Path("/api/logout")), Body.empty).addHeader(cookieHeader(sid)))
        meResp    <- app.runZIO(Request.get(URL(Path("/api/me"))).addHeader(cookieHeader(sid)))
      yield assert(meResp.status)(equalTo(Status.Unauthorized))
    },

    // Verify session works for protected endpoints after login
    test("session allows access to /trigger endpoint") {
      for
        loginResp   <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
        sid         <- ZIO.fromOption(extractSidCookie(loginResp)).orElseFail(new RuntimeException("sid cookie missing"))
        triggerResp <- app.runZIO(Request.post(URL(Path("/trigger")), Body.empty).addHeader(cookieHeader(sid)))
      yield assert(triggerResp.status)(not(equalTo(Status.Unauthorized)))
    }
  ).provideSomeLayerShared(patEnv)

  // Tests for /api/login in direct mode (credentials from environment)
  private val loginDirectModeTests = suite("/api/login (direct mode)")(
    // In direct mode, /api/login should be disabled (credentials from env)
    test("returns 400 and no cookie when direct mode is enabled") {
      for resp <- app.runZIO(loginRequest(ValidWorkspaceUrl, ValidToken))
      yield assert(resp.status)(equalTo(Status.BadRequest)) &&
        assert(extractSidCookie(resp).isEmpty)(isTrue)
    }
  ).provideSomeLayerShared(directModeEnv)
