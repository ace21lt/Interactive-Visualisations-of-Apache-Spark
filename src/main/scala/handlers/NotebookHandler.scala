package handlers

import api.{CookieHelper, ErrorResponses, TriggerRequest, TriggerResponse}
import config.DatabricksConfig
import credentials.CredentialResolver
import service.{DatabricksError, DatabricksService}
import zio.*
import zio.http.*
import zio.json.*

// Handles POST /trigger

trait NotebookHandler:
  def trigger(req: Request): UIO[Response]

case class NotebookHandlerLive(
    config: DatabricksConfig,
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

        lab = triggerReq.lab.getOrElse("lab1")

        _ <- ZIO.logInfo(
               triggerReq.step.fold(s"Trigger [$lab]: default template run")(s => s"Trigger [$lab]: edited step $s")
             )

        result <- databricksService.runLab(
                    workspaceUrl = workspaceUrl,
                    token = token,
                    lab = lab,
                    step = triggerReq.step,
                    editedCode = triggerReq.editedCode
                  )

        response = TriggerResponse(result.runId, result.state, result.output, result.executionSeconds)
        _       <- ZIO.logInfo(s"Sending response to frontend [$lab]")
      yield Response.json(response.toJson)

    effect.catchAll {
      case error @ (_: DatabricksError.NotAuthenticated) =>
        ZIO.logWarning(error.getMessage) *>
          Clock
            .currentTime(java.util.concurrent.TimeUnit.MILLISECONDS)
            .map { ts =>
              CookieHelper.clearSidCookie(
                ErrorResponses.toResponse(error, ts),
                config.secureCookies
              )
            }
      case error                                         =>
        ZIO.logError(s"Notebook execution failed: ${error.getMessage}") *>
          Clock
            .currentTime(java.util.concurrent.TimeUnit.MILLISECONDS)
            .map(ts => ErrorResponses.toResponse(error, ts))
    }

object NotebookHandler:
  val layer: ZLayer[DatabricksConfig & CredentialResolver & DatabricksService, Nothing, NotebookHandler] =
    ZLayer.fromFunction(NotebookHandlerLive.apply _)
