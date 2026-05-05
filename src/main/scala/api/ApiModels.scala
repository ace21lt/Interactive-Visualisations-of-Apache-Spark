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
  given JsonEncoder[NotebookOutput]  = DeriveJsonEncoder.gen[NotebookOutput]
  given JsonEncoder[TriggerResponse] = DeriveJsonEncoder.gen[TriggerResponse]

// Error response with timestamp for debugging
case class ErrorResponse(error: String, timestamp: Long)

object ErrorResponse:
  given JsonEncoder[ErrorResponse] = DeriveJsonEncoder.gen[ErrorResponse]

// Authentication status payload returned by /api/login and /api/me
final case class AuthResponse(workspaceUrl: String, mode: String)

object AuthResponse:
  given JsonEncoder[AuthResponse] = DeriveJsonEncoder.gen[AuthResponse]

// Login request for PAT authentication mode
final case class PatLoginRequest(workspaceUrl: String, token: String)

object PatLoginRequest:
  given JsonDecoder[PatLoginRequest] = DeriveJsonDecoder.gen[PatLoginRequest]

// Request body for POST /trigger
// lab: which lab notebook to run (default "lab1")
// step: which editable step block to substitute (None = run default template)
// editedCode: the student's edited code for that step

final case class TriggerRequest(
    lab: Option[String] = None,
    step: Option[Int] = None,
    editedCode: Option[String] = None
)

object TriggerRequest:
  given JsonDecoder[TriggerRequest] = DeriveJsonDecoder.gen[TriggerRequest]
