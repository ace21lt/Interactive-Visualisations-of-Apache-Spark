package credentials

import api.CookieHelper

import java.security.MessageDigest
import config.DatabricksConfig
import service.DatabricksError
import session.{DatabricksCreds, SessionManager}
import zio.*
import zio.http.Request

// Resolves credentials from either direct mode (env vars) or PAT session
trait CredentialResolver:
  def getCredentials(req: Request): IO[DatabricksError, (String, String)]

case class CredentialResolverLive(config: DatabricksConfig, sessionManager: SessionManager) extends CredentialResolver:

  // Mirrors the token produced by InMemorySessionManager for cross-component log correlation.
  private def logToken(sid: String): String =
    val digest = MessageDigest.getInstance("SHA-256").digest(sid.getBytes("UTF-8"))
    digest.take(4).map("%02x".format(_)).mkString

  override def getCredentials(req: Request): IO[DatabricksError, (String, String)] =
    config.directCredentials match
      case Some((url, token)) =>
        ZIO.logInfo("Using direct mode credentials").as((url, token))
      case None               =>
        resolveFromSession(req)

  private def resolveFromSession(req: Request): IO[DatabricksError, (String, String)] =
    val sidOpt = CookieHelper.getSidCookie(req)
    sidOpt match
      case Some(sid) =>
        ZIO.logInfo(s"Found session cookie token=${logToken(sid)}") *>
          sessionManager.getSession(sid).flatMap {
            case Some(creds) =>
              ZIO.logInfo(s"Session valid for workspace: ${creds.workspaceUrl}").as((creds.workspaceUrl, creds.token))
            case None        =>
              ZIO.logWarning(s"Session not found or expired token=${logToken(sid)}") *>
                ZIO.fail(DatabricksError.NotAuthenticated())
          }
      case None      =>
        ZIO.logWarning("No session cookie found in request") *>
          ZIO.fail(DatabricksError.NotAuthenticated())

object CredentialResolver:
  def getCredentials(req: Request): ZIO[CredentialResolver, DatabricksError, (String, String)] =
    ZIO.serviceWithZIO[CredentialResolver](_.getCredentials(req))

  val layer: ZLayer[DatabricksConfig & SessionManager, Nothing, CredentialResolver] =
    ZLayer.fromFunction(CredentialResolverLive.apply _)
