package handlers

import zio.http.*
import zio.test.*
import zio.test.Assertion.*

object HealthHandlerSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("HealthHandler")(
      test("returns 200 OK status") {
        val handler = HealthHandlerLive()
        val request = Request.get(URL.root)
        for response <- handler.health(request)
        yield assert(response.status)(equalTo(Status.Ok))
      },
      test("returns 'OK' text") {
        val handler = HealthHandlerLive()
        val request = Request.get(URL.root)
        for
          response <- handler.health(request)
          body     <- response.body.asString
        yield assertTrue(body == "OK")
      },
      // Note: CORS headers are injected by Middleware.cors in Main, not by individual
      // handlers. CORS behaviour is covered at the integration level in RoutesSpec.
      test("handles multiple requests") {
        val handler = HealthHandlerLive()
        for
          resp1 <- handler.health(Request.get(URL.root))
          resp2 <- handler.health(Request.get(URL.root))
          body1 <- resp1.body.asString
          body2 <- resp2.body.asString
        yield assert(body1)(equalTo("OK")) &&
          assert(body2)(equalTo("OK"))
      }
    )
