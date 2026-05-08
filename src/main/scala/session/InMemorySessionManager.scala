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
      sid <- ZIO.succeed(randomIdGenerator())
      t   <- ZIO.succeed(clock())
      _   <- sessions.update(_ + (sid -> SessionEntry(creds, createdAtMs = t, lastSeenAtMs = t)))
      _   <- ZIO.logInfo(s"[SessionManager] Created new session token=${SessionLog.logToken(sid)}")
    yield sid

  override def getSession(sessionId: String): UIO[Option[DatabricksCreds]] =
    for
      _           <- ZIO.logInfo(s"[SessionManager] Looking up session token=${SessionLog.logToken(sessionId)}")
      currentTime <- ZIO.succeed(clock())
      // Eager eviction on access: remove expired entry immediately.
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
      _           <- ZIO.when(result.isDefined)(
                       ZIO.logInfo(s"[SessionManager] Session valid token=${SessionLog.logToken(sessionId)}")
                     )
      _           <- ZIO.when(result.isEmpty)(
                       ZIO.logWarning(s"[SessionManager] Session not found or expired token=${SessionLog.logToken(sessionId)}")
                     )
    yield result

  override def deleteSession(sessionId: String): UIO[Unit] =
    ZIO.logInfo(s"[SessionManager] Clearing session token=${SessionLog.logToken(sessionId)}") *>
      sessions.update(_ - sessionId)

  private def isExpired(entry: SessionEntry, currentTime: Long): Boolean =
    (currentTime - entry.lastSeenAtMs) > IdleTimeoutMs ||
      (currentTime - entry.createdAtMs) > AbsoluteTimeoutMs

  // Background sweep: atomically remove expired sessions.
  private[session] def runCleanup(): UIO[Unit] =
    for
      t       <- ZIO.succeed(clock())
      evicted <- sessions.modify { sessionsMap =>
                   val retained = sessionsMap.filter { case (_, entry) => !isExpired(entry, t) }
                   val count    = sessionsMap.size - retained.size
                   (count, retained)
                 }
      _       <- ZIO.when(evicted > 0)(
                   ZIO.logInfo(s"[SessionManager] Background sweep evicted $evicted expired session(s)")
                 )
    yield ()

object InMemorySessionManager:

  private val rng = new SecureRandom()

  private def randomId(bytes: Int = 32): String =
    val arr = Array.ofDim[Byte](bytes)
    rng.nextBytes(arr)
    Base64.getUrlEncoder.withoutPadding().encodeToString(arr)

  private val CleanupInterval: Duration = 5.minutes

  // ZLayer.scoped ensures the background fiber is interrupted cleanly on shutdown.
  val layer: ULayer[SessionManager] =
    ZLayer.scoped(
      for
        ref    <- Ref.make(Map.empty[String, SessionEntry])
        manager = InMemorySessionManager(ref, () => java.lang.System.currentTimeMillis(), () => randomId())
        _      <- manager
                    .runCleanup()
                    .repeat(Schedule.fixed(CleanupInterval))
                    .forkScoped
        _      <- ZIO.logInfo(s"[SessionManager] Background cleanup fiber started (interval=${CleanupInterval.render})")
      yield manager
    )
