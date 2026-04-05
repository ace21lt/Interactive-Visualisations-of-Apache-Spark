package api

import zio.http.*

// CORS is configured centrally via ZIO HTTP middleware in Main.

object CorsHandler:

  // Leave response unchanged; CORS headers are applied by middleware.
  def addHeaders(response: Response): Response =
    response

  // Return an empty preflight response; middleware is responsible for
  // attaching the correct CORS headers based on application config.
  def preflight: Response =
    Response.status(Status.NoContent)
