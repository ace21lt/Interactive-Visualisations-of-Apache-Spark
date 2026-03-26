package handlers

import api.CorsHandler
import zio.*
import zio.http.*

// Handles health check endpoint
trait HealthHandler:
  def health(req: Request): UIO[Response]

case class HealthHandlerLive() extends HealthHandler:

  override def health(req: Request): UIO[Response] =
    ZIO.succeed(CorsHandler.addHeaders(Response.text("OK")))

object HealthHandler:
  val layer: ULayer[HealthHandler] =
    ZLayer.succeed(HealthHandlerLive())
