package config

import service.DatabricksError
import zio.*

object WorkspaceUrlValidationStub {

  // Provides a validator that always accepts and returns the given URL.
  def acceptAll(canonical: String): ZLayer[Any, Nothing, WorkspaceUrlValidation] =
    ZLayer.succeed(new WorkspaceUrlValidation {
      override def validate(url: String): Either[DatabricksError.ValidationError, String] =
        Right(canonical.stripSuffix("/"))
    })

  // Provides a validator that always rejects with the given message.
  def rejectAll(message: String): ZLayer[Any, Nothing, WorkspaceUrlValidation] =
    ZLayer.succeed(new WorkspaceUrlValidation {
      override def validate(url: String): Either[DatabricksError.ValidationError, String] =
        Left(DatabricksError.ValidationError(message))
    })
}
