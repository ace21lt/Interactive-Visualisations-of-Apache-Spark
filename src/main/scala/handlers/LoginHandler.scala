package handlers

import api.{CookieHelper, CorsHandler, ErrorResponses, PatLoginRequest}
import config.{DatabricksConfig, TokenValidator, WorkspaceUrlValidation}
import service.DatabricksError
import session.{DatabricksCreds, SessionManager}
import zio.*
import zio.http.*
import zio.json.*

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
          _     <- ZIO.logInfo(s"Session created successfully: ${sid.take(10)}... for workspace: $cleanUrl")
          cookie = CookieHelper.createSidCookie(sid)
          resp   =
            CorsHandler.addHeaders(Response.json(s"""{"workspaceUrl":"$cleanUrl","mode":"pat"}""")).addCookie(cookie)
          _     <- ZIO.logInfo(s"Sending login response with sid cookie")
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
          .as(
            CorsHandler.addHeaders(CookieHelper.clearSidCookie(Response.status(Status.NoContent)))
          )
      case None      =>
        ZIO
          .logInfo("Logout: no session cookie found")
          .as(
            CorsHandler.addHeaders(CookieHelper.clearSidCookie(Response.status(Status.NoContent)))
          )

  override def me(req: Request): UIO[Response] =
    config.directCredentials match
      case Some((url, _)) =>
        ZIO
          .logInfo("Checking auth: direct mode")
          .as(
            CorsHandler.addHeaders(Response.json(s"""{"workspaceUrl":"$url","mode":"direct"}"""))
          )
      case None           =>
        ZIO.logInfo("Checking auth: PAT session mode") *>
          (CookieHelper.getSidCookie(req) match
            case Some(sid) =>
              ZIO.logInfo(s"Found session cookie: ${sid.take(10)}...") *>
                sessionManager.getSession(sid).map {
                  case Some(creds) =>
                    CorsHandler.addHeaders(Response.json(s"""{"workspaceUrl":"${creds.workspaceUrl}","mode":"pat"}"""))
                  case None        =>
                    CorsHandler.addHeaders(Response.text("Not authenticated").status(Status.Unauthorized))
                }
            case None      =>
              ZIO
                .logWarning("No session cookie found in /api/me request")
                .as(
                  CorsHandler.addHeaders(Response.text("Not authenticated").status(Status.Unauthorized))
                )
          )

object LoginHandler:
  val layer: ZLayer[DatabricksConfig & SessionManager & WorkspaceUrlValidation, Nothing, LoginHandler] =
    ZLayer.fromFunction(LoginHandlerLive.apply _)
