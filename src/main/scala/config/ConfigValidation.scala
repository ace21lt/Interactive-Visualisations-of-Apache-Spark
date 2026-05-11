package config

import zio.*

// Validates configuration values for security and correctness
object ConfigValidation:

  // Security: prevent URL decode attacks
  private val MaxUrlDecodeIterations = 5

  // Validate workspace URL using the URL validator
  def validateDirectUrl(url: String): IO[String, String] =
    ZIO.fromEither(WorkspaceUrlValidator.validate(url).left.map(_.logMessage))

  // Validate Databricks token format
  def validateDirectToken(token: String): IO[String, String] =
    ZIO.fromEither(TokenValidator.validate(token).left.map(_.logMessage))

  // Validate notebook path
  def validateNotebookPath(path: String): IO[String, String] =
    def fullyDecode(input: String): Either[String, String] =
      try
        var current  = input
        var previous = ""
        var iter     = 0
        while current != previous && iter < MaxUrlDecodeIterations do
          previous = current
          current = java.net.URLDecoder.decode(current, java.nio.charset.StandardCharsets.UTF_8)
          iter += 1
        Right(current)
      catch case _: IllegalArgumentException => Left("Malformed URL encoding")

    fullyDecode(path) match
      case Left(e)        => ZIO.fail(s"Invalid notebook path: $e")
      case Right(decoded) =>
        val parts        = decoded.split('/').filter(_.nonEmpty)
        val hasTraversal = parts.contains("..") || parts.contains(".")
        val hasBackslash = decoded.contains("\\")

        val isValid = decoded.startsWith("/") &&
          decoded.length > 1 &&
          !hasTraversal &&
          !hasBackslash

        if isValid then ZIO.succeed(decoded)
        else ZIO.fail("Invalid notebook path format")
