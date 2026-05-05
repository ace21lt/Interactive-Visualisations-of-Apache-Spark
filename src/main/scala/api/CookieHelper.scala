package api

import zio.*
import zio.http.*

// Handles session cookie operations
object CookieHelper:

  val SessionCookieName = "sid"

  // Extract session ID from request cookies
  def getSidCookie(req: Request): Option[String] =
    req.cookie(SessionCookieName).map(_.content)

  // Create a session cookie; set secure=true for HTTPS. maxAge=None => browser session cookie.
  def createSidCookie(sid: String, secure: Boolean = false, maxAge: Option[Duration] = None): Cookie.Response =
    Cookie.Response(
      name = SessionCookieName,
      content = sid,
      domain = None,
      path = Some(Path.root),
      isSecure = secure,
      isHttpOnly = true,
      sameSite = Some(Cookie.SameSite.Lax),
      maxAge = maxAge
    )

  // Clear the session cookie by setting maxAge=0; set secure=true for HTTPS when applicable.
  def clearSidCookie(response: Response, secure: Boolean = false): Response =
    response.addCookie(
      Cookie.Response(
        name = SessionCookieName,
        content = "",
        domain = None,
        path = Some(Path.root),
        isSecure = secure,
        isHttpOnly = true,
        sameSite = Some(Cookie.SameSite.Lax),
        maxAge = Some(0.seconds)
      )
    )
