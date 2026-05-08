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
    // Enforce a max edited-code length and return 400 on invalid JSON.
    val MaxEditedCodeChars = 20_000

    val effect =
      for
        creds                <- credentialResolver.getCredentials(req)
        (workspaceUrl, token) = creds

        bodyStr <- req.body.asString.orElseSucceed("")

        // Allow empty body (uses default TriggerRequest); reject malformed non-empty JSON.
        triggerReq <-
          if bodyStr.trim.isEmpty then ZIO.succeed(TriggerRequest())
          else
            ZIO
              .fromEither(bodyStr.fromJson[TriggerRequest])
              .mapError(err => DatabricksError.BadRequestError(s"Invalid JSON: $err"))

        // Enforce edited code size limit to avoid excessively large submissions
        _          <- ZIO.when(triggerReq.editedCode.exists(_.length > MaxEditedCodeChars))(
                        ZIO.fail(
                          DatabricksError.ValidationError(
                            s"editedCode exceeds maximum allowed length of $MaxEditedCodeChars characters"
                          )
                        )
                      )

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
