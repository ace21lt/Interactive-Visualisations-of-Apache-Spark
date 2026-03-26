package api

import zio.http.*

// Handles Cross-Origin Resource Sharing (CORS) headers for frontend requests
object CorsHandler:

  private val FrontendOrigin = "http://localhost:3000"

  // Add CORS headers to allow frontend to call backend
  def addHeaders(response: Response): Response =
    response
      .addHeader("Access-Control-Allow-Origin", FrontendOrigin)
      .addHeader("Access-Control-Allow-Credentials", "true")
      .addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      .addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  // Response for OPTIONS preflight requests
  def preflight: Response =
    Response
      .status(Status.NoContent)
      .addHeader("Access-Control-Allow-Origin", FrontendOrigin)
      .addHeader("Access-Control-Allow-Credentials", "true")
      .addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      .addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
      .addHeader("Access-Control-Max-Age", "86400")
