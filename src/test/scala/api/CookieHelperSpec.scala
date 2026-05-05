package api

import zio.*
import zio.http.*
import zio.test.*
import zio.test.Assertion.*

object CookieHelperSpec extends ZIOSpecDefault:

  private def setCookieHeaderValue(response: Response): Option[String] =
    response.header(Header.SetCookie).map(_.renderedValue)

  override def spec: Spec[TestEnvironment, Any] =
    suite("CookieHelper")(
      // getSidCookie tests
      test("extracts session ID from request with sid cookie") {
        val req    = Request
          .get(URL.root)
          .addHeader(Header.Cookie(zio.NonEmptyChunk(Cookie.Request("sid", "test-session-123"))))
        val result = CookieHelper.getSidCookie(req)
        assertTrue(result.get == "test-session-123")
      },
      test("returns None when request has no cookies") {
        val req    = Request.get(URL.root)
        val result = CookieHelper.getSidCookie(req)
        assert(result)(isNone)
      },
      test("returns None when request has cookies but no 'sid'") {
        val req    = Request
          .get(URL.root)
          .addHeader(Header.Cookie(zio.NonEmptyChunk(Cookie.Request("other", "value"))))
        val result = CookieHelper.getSidCookie(req)
        assert(result)(isNone)
      },
      test("returns None when request has multiple cookies but no 'sid'") {
        val req    = Request
          .get(URL.root)
          .addHeader(
            Header.Cookie(
              zio.NonEmptyChunk(
                Cookie.Request("auth", "token123"),
                Cookie.Request("pref", "dark-mode")
              )
            )
          )
        val result = CookieHelper.getSidCookie(req)
        assert(result)(isNone)
      },
      test("extracts sid when among multiple cookies") {
        val req    = Request
          .get(URL.root)
          .addHeader(
            Header.Cookie(
              zio.NonEmptyChunk(
                Cookie.Request("auth", "token123"),
                Cookie.Request("sid", "my-session-456"),
                Cookie.Request("pref", "dark-mode")
              )
            )
          )
        val result = CookieHelper.getSidCookie(req)
        assertTrue(result.get == "my-session-456")
      },

      // createSidCookie tests
      test("creates cookie with correct name") {
        val cookie = CookieHelper.createSidCookie("test-sid-789")
        assert(cookie.name)(equalTo("sid"))
      },
      test("creates cookie with correct content") {
        val cookie = CookieHelper.createSidCookie("test-sid-789")
        assert(cookie.content)(equalTo("test-sid-789"))
      },
      test("creates HttpOnly cookie") {
        val cookie = CookieHelper.createSidCookie("test-sid")
        assertTrue(cookie.isHttpOnly)
      },
      test("creates cookie with Lax SameSite") {
        val cookie = CookieHelper.createSidCookie("test-sid")
        assertTrue(cookie.sameSite.get == Cookie.SameSite.Lax)
      },
      test("creates cookie with root path") {
        val cookie = CookieHelper.createSidCookie("test-sid")
        assert(cookie.path)(equalTo(Some(Path.root)))
      },
      test("creates cookie with no domain restriction") {
        val cookie = CookieHelper.createSidCookie("test-sid")
        assert(cookie.domain)(isNone)
      },
      test("creates cookie without max age (expires when session ends)") {
        val cookie = CookieHelper.createSidCookie("test-sid")
        assert(cookie.maxAge)(isNone)
      },
      test("creates non-secure cookie by default") {
        val cookie = CookieHelper.createSidCookie("test-sid")
        assertTrue(!cookie.isSecure)
      },
      test("creates secure cookie when secure = true") {
        val cookie = CookieHelper.createSidCookie("test-sid", secure = true)
        assertTrue(cookie.isSecure)
      },
      test("clear cookie is non-secure by default") {
        val response = Response.text("test")
        val cleared  = CookieHelper.clearSidCookie(response)
        val isSecure = setCookieHeaderValue(cleared).exists(_.contains("Secure"))
        assertTrue(!isSecure)
      },
      test("clear cookie is secure when secure = true") {
        val response = Response.text("test")
        val cleared  = CookieHelper.clearSidCookie(response, secure = true)
        val isSecure = setCookieHeaderValue(cleared).exists(_.contains("Secure"))
        assertTrue(isSecure)
      },

      // clearSidCookie tests
      test("clears sid cookie with empty content") {
        val response  = Response.text("test")
        val cleared   = CookieHelper.clearSidCookie(response)
        val setCookie = setCookieHeaderValue(cleared)
        assert(setCookie)(isSome(containsString("sid=;")))
      },
      test("clear cookie has maxAge set to 0") {
        val response       = Response.text("test")
        val cleared        = CookieHelper.clearSidCookie(response)
        val hasClearCookie = setCookieHeaderValue(cleared).exists(_.contains("Max-Age=0"))
        assertTrue(hasClearCookie)
      },
      test("clear cookie name is 'sid'") {
        val response     = Response.text("test")
        val cleared      = CookieHelper.clearSidCookie(response)
        val hasSidCookie = setCookieHeaderValue(cleared).exists(_.startsWith("sid="))
        assertTrue(hasSidCookie)
      }
    )
