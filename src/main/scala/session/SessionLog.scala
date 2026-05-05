package session

import java.security.MessageDigest

// Produce a short, stable SHA-256-based hex token for session log correlation.
object SessionLog:

  def logToken(sid: String): String =
    val digest = MessageDigest.getInstance("SHA-256").digest(sid.getBytes(java.nio.charset.StandardCharsets.UTF_8))
    digest.take(4).map("%02x".format(_)).mkString // 8 hex chars, e.g. "a3f9c12b"
