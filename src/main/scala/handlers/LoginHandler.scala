package handlers

import api.{CookieHelper, ErrorResponses, PatLoginRequest}
import config.{DatabricksConfig, TokenValidator, WorkspaceUrlValidation}
import service.DatabricksError
import session.{DatabricksCreds, SessionManager}
import zio.*
import zio.http.*
import zio.json.*

import java.security.MessageDigest

// Handles login, logout, and authentication status endpoints
trait LoginHandler:
  def login(req: Request): UIO[Response]
  def logout(req: Request): UIO[Response]
  def me(req: Request): UIO[Response]

case class LoginHandlerLive(
    config: DatabricksConfig,
    sessionManager: SessionManager,
    urlValidation: WorkspaceUrlValidation
) extends LoginHandler:

  // Mirrors the token produced by InMemorySessionManager so log lines correlate
  // across the handler and session manager without exposing raw ID material.
  private def logToken(sid: String): String =
    val digest = MessageDigest.getInstance("SHA-256").digest(sid.getBytes("UTF-8"))
    digest.take(4).map("%02x".format(_)).mkString

  override def login(req: Request): UIO[Response] =
    val now = Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS)

    val effect =
      if config.isDirectMode then
        now.map(ts =>
          ErrorResponses.toResponse(
            DatabricksError.BadRequestError("Direct mode enabled; /api/login not required"),
            ts
          )
        )
      else
        (for
          body     <- req.body.asString
          _        <- ZIO.logInfo("Login request received: workspaceUrl in body")
          loginReq <- ZIO
                        .fromEither(body.fromJson[PatLoginRequest])
                        .mapError(err => DatabricksError.BadRequestError(s"Invalid JSON: $err"))

          cleanUrl <- ZIO.fromEither(urlValidation.validate(loginReq.workspaceUrl))
          cleanTok <- ZIO.fromEither(TokenValidator.validate(loginReq.token))

          sid   <- sessionManager.createSession(DatabricksCreds(cleanUrl, cleanTok))
          _     <- ZIO.logInfo(s"Session created successfully: token=${logToken(sid)} workspace=$cleanUrl")
          cookie = CookieHelper.createSidCookie(sid, config.secureCookies)
          resp   = Response.json(s"""{"workspaceUrl":"$cleanUrl","mode":"pat"}""").addCookie(cookie)
          _     <- ZIO.logInfo("Sending login response with sid cookie")
        yield resp).catchAll { e =>
          ZIO.logWarning(s"Login failed: ${e.getMessage}") *>
            now.map(ts => ErrorResponses.toResponse(DatabricksError.fromThrowable(e), ts))
        }

    effect

  override def logout(req: Request): UIO[Response] =
    val sidOpt = CookieHelper.getSidCookie(req)
    sidOpt match
      case Some(sid) =>
        sessionManager
          .deleteSession(sid)
          .as(CookieHelper.clearSidCookie(Response.status(Status.NoContent), config.secureCookies))
      case None      =>
        ZIO
          .logInfo("Logout: no session cookie found")
          .as(CookieHelper.clearSidCookie(Response.status(Status.NoContent), config.secureCookies))

  override def me(req: Request): UIO[Response] =
    config.directCredentials match
      case Some((url, _)) =>
        ZIO
          .logInfo("Checking auth: direct mode")
          .as(Response.json(s"""{"workspaceUrl":"$url","mode":"direct"}"""))
      case None           =>
        ZIO.logInfo("Checking auth: PAT session mode") *>
          (CookieHelper.getSidCookie(req) match
            case Some(sid) =>
              ZIO.logInfo(s"Found session cookie token=${logToken(sid)}") *>
                sessionManager.getSession(sid).flatMap {
                  case Some(creds) =>
                    ZIO.succeed(Response.json(s"""{"workspaceUrl":"${creds.workspaceUrl}","mode":"pat"}"""))
                  case None        =>
                    ZIO.logWarning(s"Session expired for token=${logToken(sid)}") *>
                      Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS).map { ts =>
                        CookieHelper.clearSidCookie(
                          ErrorResponses.toResponse(DatabricksError.NotAuthenticated(), ts),
                          config.secureCookies
                        )
                      }
                }
            case None      =>
              ZIO.logWarning("No session cookie found in /api/me request") *>
                Clock.currentTime(java.util.concurrent.TimeUnit.MILLISECONDS).map { ts =>
                  CookieHelper.clearSidCookie(
                    ErrorResponses.toResponse(DatabricksError.NotAuthenticated(), ts),
                    config.secureCookies
                  )
                }
          )

object LoginHandler:
  val layer: ZLayer[DatabricksConfig & SessionManager & WorkspaceUrlValidation, Nothing, LoginHandler] =
    ZLayer.fromFunction(LoginHandlerLive.apply _)
