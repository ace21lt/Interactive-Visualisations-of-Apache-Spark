package session

import zio.*

import java.security.SecureRandom
import java.util.Base64

// In-memory session manager using ZIO Ref for thread-safe state
case class InMemorySessionManager(
    sessions: Ref[Map[String, SessionEntry]],
    clock: () => Long,
    randomIdGenerator: () => String
) extends SessionManager:

  private val IdleTimeoutMs: Long     = 60L * 60L * 1000L       // 60 minutes idle
  private val AbsoluteTimeoutMs: Long = 24L * 60L * 60L * 1000L // 24 hours max lifetime

  override def createSession(creds: DatabricksCreds): UIO[String] =
    for
      _   <- cleanup()
      sid <- ZIO.succeed(randomIdGenerator())
      t   <- ZIO.succeed(clock())
      _   <- sessions.update(_ + (sid -> SessionEntry(creds, createdAtMs = t, lastSeenAtMs = t)))
      _   <- ZIO.logInfo(s"[SessionManager] Created new session: ${sid.take(10)}...")
    yield sid

  override def getSession(sessionId: String): UIO[Option[DatabricksCreds]] =
    for
      _           <- cleanup()
      _           <- ZIO.logInfo(s"[SessionManager] Looking up session: ${sessionId.take(10)}...")
      currentTime <- ZIO.succeed(clock())
      result      <- sessions.modify { sessionsMap =>
                       sessionsMap.get(sessionId) match
                         case Some(entry) if isExpired(entry, currentTime) =>
                           (None, sessionsMap - sessionId)
                         case Some(entry)                                  =>
                           val updated = entry.copy(lastSeenAtMs = currentTime)
                           (Some(entry.creds), sessionsMap + (sessionId -> updated))
                         case None                                         =>
                           (None, sessionsMap)
                     }
      _           <- ZIO.when(result.isDefined)(ZIO.logInfo(s"[SessionManager] Session valid: ${sessionId.take(10)}..."))
      _           <- ZIO.when(result.isEmpty)(
                       ZIO.logWarning(s"[SessionManager] Session not found or expired: ${sessionId.take(10)}...")
                     )
    yield result

  override def deleteSession(sessionId: String): UIO[Unit] =
    ZIO.logInfo(s"[SessionManager] Clearing session: ${sessionId.take(10)}...") *>
      sessions.update(_ - sessionId)

  private def isExpired(entry: SessionEntry, currentTime: Long): Boolean =
    (currentTime - entry.lastSeenAtMs) > IdleTimeoutMs ||
      (currentTime - entry.createdAtMs) > AbsoluteTimeoutMs

  private def cleanup(): UIO[Unit] =
    for
      t <- ZIO.succeed(clock())
      _ <- sessions.update { sessionsMap =>
             sessionsMap.filter { case (_, entry) =>
               !isExpired(entry, t)
             }
           }
    yield ()

object InMemorySessionManager:

  private val rng = new SecureRandom()

  private def randomId(bytes: Int = 32): String =
    val arr = Array.ofDim[Byte](bytes)
    rng.nextBytes(arr)
    Base64.getUrlEncoder.withoutPadding().encodeToString(arr)

  val layer: ULayer[SessionManager] =
    ZLayer.fromZIO(
      Ref
        .make(Map.empty[String, SessionEntry])
        .map(ref => InMemorySessionManager(ref, () => java.lang.System.currentTimeMillis(), () => randomId()))
    )
