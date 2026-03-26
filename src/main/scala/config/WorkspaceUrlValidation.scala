package config

import service.DatabricksError

trait WorkspaceUrlValidation {
  def validate(url: String): Either[DatabricksError.ValidationError, String]
}

object WorkspaceUrlValidation {

  val live: WorkspaceUrlValidation = (url: String) => WorkspaceUrlValidator.validate(url)
}
