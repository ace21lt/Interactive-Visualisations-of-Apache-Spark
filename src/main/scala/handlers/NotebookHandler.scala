package handlers

import api.{CorsHandler, ErrorResponses, TriggerRequest, TriggerResponse}
import credentials.CredentialResolver
import service.{DatabricksError, DatabricksService}
import zio.*
import zio.http.*
import zio.json.*

// Handles POST /trigger

trait NotebookHandler:
  def trigger(req: Request): UIO[Response]

case class NotebookHandlerLive(
    credentialResolver: CredentialResolver,
    databricksService: DatabricksService
) extends NotebookHandler:

  override def trigger(req: Request): UIO[Response] =
    val effect =
      for
        creds                <- credentialResolver.getCredentials(req)
        (workspaceUrl, token) = creds

        bodyStr   <- req.body.asString.orElseSucceed("")
        triggerReq = bodyStr.fromJson[TriggerRequest].getOrElse(TriggerRequest())

        _ <- ZIO.logInfo(
               triggerReq.step.fold("Trigger: default template run")(s => s"Trigger: edited step $s")
             )

        result <- databricksService.runLab(
                    workspaceUrl = workspaceUrl,
                    token = token,
                    step = triggerReq.step,
                    editedCode = triggerReq.editedCode
                  )

        response = TriggerResponse(result.runId, result.state, result.output, result.executionSeconds)
        _       <- ZIO.logInfo("Sending response to frontend")
      yield CorsHandler.addHeaders(Response.json(response.toJson))

    effect.catchAll {
      case error @ (_: DatabricksError.NotAuthenticated) =>
        ZIO
          .logWarning(error.getMessage)
          .as(CorsHandler.addHeaders(Response.text("Not authenticated").status(Status.Unauthorized)))
      case error                                         =>
        ZIO.logError(s"Notebook execution failed: ${error.getMessage}") *>
          Clock
            .currentTime(java.util.concurrent.TimeUnit.MILLISECONDS)
            .map(ts => ErrorResponses.toResponse(error, ts))
    }

object NotebookHandler:
  val layer: ZLayer[CredentialResolver & DatabricksService, Nothing, NotebookHandler] =
    ZLayer.fromFunction(NotebookHandlerLive.apply _)
