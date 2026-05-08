package handlers

import zio.*
import zio.http.*

// Handles health check endpoint
trait HealthHandler:
  def health(req: Request): UIO[Response]

object HealthHandlerLive extends HealthHandler:

  override def health(req: Request): UIO[Response] =
    ZIO.succeed(Response.text("OK"))

object HealthHandler:
  val layer: ULayer[HealthHandler] =
    ZLayer.succeed(HealthHandlerLive)
