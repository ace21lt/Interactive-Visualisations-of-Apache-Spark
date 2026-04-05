package api

import models.NotebookOutput
import zio.json.*

// Response returned when notebook execution completes successfully
case class TriggerResponse(
    runId: Long,
    state: String,
    output: Option[NotebookOutput],
    executionSeconds: Option[Long] = None
)

object TriggerResponse:
  implicit val notebookOutputEncoder: JsonEncoder[NotebookOutput] = DeriveJsonEncoder.gen[NotebookOutput]
  implicit val encoder: JsonEncoder[TriggerResponse]              = DeriveJsonEncoder.gen[TriggerResponse]

// Error response with timestamp for debugging
case class ErrorResponse(error: String, timestamp: Long)

object ErrorResponse:
  implicit val encoder: JsonEncoder[ErrorResponse] = DeriveJsonEncoder.gen[ErrorResponse]

// Login request for PAT authentication mode
final case class PatLoginRequest(workspaceUrl: String, token: String)

object PatLoginRequest:
  implicit val decoder: JsonDecoder[PatLoginRequest] = DeriveJsonDecoder.gen[PatLoginRequest]

// Request body for POST /trigger

final case class TriggerRequest(
    step: Option[Int] = None,
    editedCode: Option[String] = None
)

object TriggerRequest:
  implicit val decoder: JsonDecoder[TriggerRequest] = DeriveJsonDecoder.gen[TriggerRequest]
