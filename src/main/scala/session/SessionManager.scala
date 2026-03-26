package session

import zio.*

// Credentials stored in a session
final case class DatabricksCreds(
    workspaceUrl: String,
    token: String
)

// Session entry with timestamps for expiry tracking
final case class SessionEntry(
    creds: DatabricksCreds,
    createdAtMs: Long,
    lastSeenAtMs: Long
)

// Manages user sessions for PAT authentication mode
trait SessionManager:
  def createSession(creds: DatabricksCreds): UIO[String]
  def getSession(sessionId: String): UIO[Option[DatabricksCreds]]
  def deleteSession(sessionId: String): UIO[Unit]

object SessionManager:
  def createSession(creds: DatabricksCreds): URIO[SessionManager, String] =
    ZIO.serviceWithZIO[SessionManager](_.createSession(creds))

  def getSession(sessionId: String): URIO[SessionManager, Option[DatabricksCreds]] =
    ZIO.serviceWithZIO[SessionManager](_.getSession(sessionId))

  def deleteSession(sessionId: String): URIO[SessionManager, Unit] =
    ZIO.serviceWithZIO[SessionManager](_.deleteSession(sessionId))
