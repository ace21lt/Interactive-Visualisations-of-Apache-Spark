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
  def createSidCookie(sid: String): Cookie.Response =
    Cookie.Response(
      name = SessionCookieName,
      content = sid,
      domain = None,
      path = Some(Path.root),
      isSecure = false,
      isHttpOnly = true,
      sameSite = Some(Cookie.SameSite.Lax),
      maxAge = None
    )

  // Clear the session cookie by setting maxAge to 0
  def clearSidCookie(response: Response): Response =
    response.addCookie(
      Cookie.Response(
        name = SessionCookieName,
        content = "",
        domain = None,
        path = Some(Path.root),
        isSecure = false,
        isHttpOnly = true,
        sameSite = Some(Cookie.SameSite.Lax),
        maxAge = Some(0.seconds)
      )
    )
