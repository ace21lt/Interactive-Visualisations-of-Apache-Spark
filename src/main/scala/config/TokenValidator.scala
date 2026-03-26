package config

import service.DatabricksError

object TokenValidator {
  private val MinTokenLength        = 10
  private val DatabricksTokenPrefix = "dapi"

  def validate(token: String): Either[DatabricksError.ValidationError, String] = {
    val t = Option(token).map(_.trim).getOrElse("")

    val isValid = t.nonEmpty &&
      t.length >= MinTokenLength &&
      t.startsWith(DatabricksTokenPrefix) &&
      t.matches("^[a-zA-Z0-9-]+$")

    if (isValid) Right(t)
    else Left(DatabricksError.ValidationError("Invalid Databricks token format"))
  }
}
