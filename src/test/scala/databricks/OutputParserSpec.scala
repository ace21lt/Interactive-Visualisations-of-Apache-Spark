package databricks

import zio.test.*
import zio.test.Assertion.*

object OutputParserSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("OutputParser")(
      test("extracts a direct result field") {
        assertTrue(OutputParser.extractResultField("""{"result":"ok"}""").get == "ok")
      },
      test("extracts notebook_output.result") {
        assertTrue(OutputParser.extractResultField("""{"notebook_output":{"result":"top"}}""").get == "top")
      },
      test("extracts metadata.notebook_output.result") {
        assertTrue(
          OutputParser
            .extractResultField(
              """{"metadata":{"notebook_output":{"result":"nested"}}}"""
            )
            .get == "nested"
        )
      },
      test("prefers metadata result over top-level result") {
        assertTrue(
          OutputParser
            .extractResultField(
              """{"metadata":{"notebook_output":{"result":"nested"}},"notebook_output":{"result":"top"},"result":"direct"}"""
            )
            .get == "nested"
        )
      },
      test("returns None for invalid JSON") {
        assert(OutputParser.extractResultField("{not-json}"))(isNone)
      }
    )
