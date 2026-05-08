package session

import zio.*
import zio.test.*
import zio.test.Assertion.*

// Unit tests for InMemorySessionManager with injectable clock and ID generator.

object InMemorySessionManagerSpec extends ZIOSpecDefault:

  private val testCreds = DatabricksCreds("https://test.databricks.com", "dapiTOKEN-123456")

  private def managerAt(nowMs: Long): UIO[InMemorySessionManager] =
    Ref.make(Map.empty[String, SessionEntry]).map { ref =>
      InMemorySessionManager(ref, () => nowMs, () => "fixed-session-id")
    }

  override def spec: Spec[TestEnvironment & Scope, Any] =
    suite("InMemorySessionManager")(
      createSessionSuite,
      getSessionSuite,
      deleteSessionSuite,
      expiryAndCleanupSuite
    )

  private val createSessionSuite = suite("createSession")(
    test("returns the generated session ID") {
      for
        mgr <- managerAt(1000L)
        sid <- mgr.createSession(testCreds)
      yield assert(sid)(equalTo("fixed-session-id"))
    },
    test("stores the credentials so getSession retrieves them") {
      for
        mgr   <- managerAt(1000L)
        sid   <- mgr.createSession(testCreds)
        found <- mgr.getSession(sid)
      yield assert(found)(isSome(equalTo(testCreds)))
    },
    test("creates independent sessions with different IDs") {
      for
        ref  <- Ref.make(Map.empty[String, SessionEntry])
        n     = new java.util.concurrent.atomic.AtomicInteger(0)
        mgr   = InMemorySessionManager(ref, () => 1000L, () => s"sid-${n.getAndIncrement()}")
        sid0 <- mgr.createSession(testCreds)
        sid1 <- mgr.createSession(testCreds.copy(workspaceUrl = "https://other.databricks.com"))
        map  <- ref.get
      yield assert(map.size)(equalTo(2)) &&
        assert(sid0)(not(equalTo(sid1))) &&
        assert(map.contains(sid0) && map.contains(sid1))(isTrue)
    }
  )

  private val getSessionSuite = suite("getSession")(
    test("returns None for an unknown session ID") {
      for
        mgr   <- managerAt(1000L)
        found <- mgr.getSession("does-not-exist")
      yield assert(found)(isNone)
    },
    test("returns None after session is deleted") {
      for
        mgr   <- managerAt(1000L)
        sid   <- mgr.createSession(testCreds)
        _     <- mgr.deleteSession(sid)
        found <- mgr.getSession(sid)
      yield assert(found)(isNone)
    },
    test("updates lastSeenAtMs on successful access") {
      for
        ref      <- Ref.make(Map.empty[String, SessionEntry])
        clockTick = new java.util.concurrent.atomic.AtomicLong(1000L)
        mgr       = InMemorySessionManager(ref, () => clockTick.getAndAdd(5000L), () => "sid-tick")
        _        <- mgr.createSession(testCreds)
        before   <- ref.get.map(_.get("sid-tick"))
        _        <- mgr.getSession("sid-tick")
        after    <- ref.get.map(_.get("sid-tick"))
      yield assert(before.map(_.lastSeenAtMs))(isSome(equalTo(1000L))) &&
        assert(after.map(_.lastSeenAtMs))(isSome(equalTo(6000L)))
    }
  )

  private val deleteSessionSuite = suite("deleteSession")(
    test("is idempotent — deleting non-existent session does not fail") {
      for
        mgr <- managerAt(1000L)
        _   <- mgr.deleteSession("ghost-session")
      yield assertCompletes
    },
    test("removes only the targeted session") {
      for
        ref  <- Ref.make(Map.empty[String, SessionEntry])
        n     = new java.util.concurrent.atomic.AtomicInteger(0)
        mgr   = InMemorySessionManager(ref, () => 1000L, () => s"sid-${n.getAndIncrement()}")
        sid0 <- mgr.createSession(testCreds)
        sid1 <- mgr.createSession(testCreds.copy(workspaceUrl = "https://b.databricks.com"))
        _    <- mgr.deleteSession(sid0)
        map  <- ref.get
      yield assert(map.size)(equalTo(1)) &&
        assert(map.contains(sid1) && !map.contains(sid0))(isTrue)
    }
  )

  private val expiryAndCleanupSuite = suite("session expiry")(
    test("getSession evicts an idle-expired session eagerly") {
      val createdAt  = 0L
      val lookedUpAt = 61L * 60L * 1000L
      for
        ref          <- Ref.make(Map.empty[String, SessionEntry])
        clockTick     = new java.util.concurrent.atomic.AtomicLong(createdAt)
        mgr           = InMemorySessionManager(ref, () => clockTick.get(), () => "sid-expiry")
        _            <- mgr.createSession(testCreds)
        beforeDelete <- ref.get.map(_.size)
        _             = clockTick.set(lookedUpAt)
        found        <- mgr.getSession("sid-expiry")
        afterDelete  <- ref.get.map(_.size)
      yield assert(found)(isNone) &&
        assert(beforeDelete)(equalTo(1)) &&
        assert(afterDelete)(equalTo(0))
    },
    test("getSession does NOT evict a session at exactly idle-timeout threshold") {
      val createdAt   = 0L
      val atThreshold = 60L * 60L * 1000L
      for
        ref      <- Ref.make(Map.empty[String, SessionEntry])
        clockTick = new java.util.concurrent.atomic.AtomicLong(createdAt)
        mgr       = InMemorySessionManager(ref, () => clockTick.get(), () => "sid-boundary")
        _        <- mgr.createSession(testCreds)
        _         = clockTick.set(atThreshold)
        found    <- mgr.getSession("sid-boundary")
      yield assert(found)(isSome)
    },
    test("getSession evicts an absolute-timeout-expired session eagerly") {
      // Absolute timeout = 24 hours.
      val absoluteTimeoutMs = 25L * 60L * 60L * 1000L // 25 hours in ms
      for
        ref      <- Ref.make(Map.empty[String, SessionEntry])
        clockTick = new java.util.concurrent.atomic.AtomicLong(0L)
        mgr       = InMemorySessionManager(ref, () => clockTick.get(), () => "sid-abs")
        _        <- mgr.createSession(testCreds)
        _         = clockTick.set(absoluteTimeoutMs)
        found    <- mgr.getSession("sid-abs")
      yield assert(found)(isNone)
    },
    test("runCleanup removes all expired entries from the map") {
      for
        ref      <- Ref.make(Map.empty[String, SessionEntry])
        clockTick = new java.util.concurrent.atomic.AtomicLong(0L)
        n         = new java.util.concurrent.atomic.AtomicInteger(0)
        mgr       = InMemorySessionManager(ref, () => clockTick.get(), () => s"sid-sweep-${n.getAndIncrement()}")
        _        <- mgr.createSession(testCreds)
        _        <- mgr.createSession(testCreds)
        _         = clockTick.set(61L * 60L * 1000L)
        _        <- mgr.runCleanup()
        map      <- ref.get
      yield assert(map.isEmpty)(isTrue)
    },
    test("runCleanup retains non-expired entries") {
      for
        ref      <- Ref.make(Map.empty[String, SessionEntry])
        clockTick = new java.util.concurrent.atomic.AtomicLong(0L)
        n         = new java.util.concurrent.atomic.AtomicInteger(0)
        mgr       = InMemorySessionManager(ref, () => clockTick.get(), () => s"sid-retain-${n.getAndIncrement()}")
        sid0     <- mgr.createSession(testCreds)
        _         = clockTick.set(61L * 60L * 1000L)
        sid1     <- mgr.createSession(testCreds)
        _        <- mgr.runCleanup()
        map      <- ref.get
      yield assert(map.size)(equalTo(1)) &&
        assert(map.contains(sid1) && !map.contains(sid0))(isTrue)
    }
  )
