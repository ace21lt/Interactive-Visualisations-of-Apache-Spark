package databricks

import zio.json.ast.Json

// Parses JSON output from Databricks notebook execution
object OutputParser:

  // Extract the result field from notebook output JSON
  // Tries multiple paths: metadata.notebook_output.result, notebook_output.result, result
  def extractResultField(json: String): Option[String] =
    Json.decoder.decodeJson(json).toOption.flatMap { ast =>
      def getString(obj: Json, key: String): Option[String] = obj match
        case Json.Obj(fields) =>
          fields.find(_._1 == key).flatMap {
            case (_, Json.Str(s)) => Some(s)
            case _                => None
          }
        case _                => None

      def getObj(obj: Json, key: String): Option[Json] = obj match
        case Json.Obj(fields) => fields.find(_._1 == key).map(_._2)
        case _                => None

      // Try: metadata.notebook_output.result
      val fromMetadata = for
        metadata       <- getObj(ast, "metadata")
        notebookOutput <- getObj(metadata, "notebook_output")
        result         <- getString(notebookOutput, "result")
      yield result

      // Try: notebook_output.result
      val fromTopLevel = for
        notebookOutput <- getObj(ast, "notebook_output")
        result         <- getString(notebookOutput, "result")
      yield result

      // Try: direct result
      val fromDirect = getString(ast, "result")

      fromMetadata.orElse(fromTopLevel).orElse(fromDirect)
    }
