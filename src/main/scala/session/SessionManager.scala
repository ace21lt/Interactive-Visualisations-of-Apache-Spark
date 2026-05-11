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
