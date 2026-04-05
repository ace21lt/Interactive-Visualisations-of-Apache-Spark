package api

import zio.*
import zio.http.*

// Handles session cookie operations
object CookieHelper:

  val SessionCookieName = "sid"

  // Extract session ID from request cookies
  def getSidCookie(req: Request): Option[String] =
    req.cookie(SessionCookieName).map(_.content)

  // Create a session cookie with the given session ID
  // Pass secure = true when the app is served over HTTPS
  def createSidCookie(sid: String, secure: Boolean = false): Cookie.Response =
    Cookie.Response(
      name = SessionCookieName,
      content = sid,
      domain = None,
      path = Some(Path.root),
      isSecure = secure,
      isHttpOnly = true,
      sameSite = Some(Cookie.SameSite.Lax),
      maxAge = None
    )

  // Clear the session cookie by setting maxAge to 0
  // Pass secure = true when the app is served over HTTPS
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
