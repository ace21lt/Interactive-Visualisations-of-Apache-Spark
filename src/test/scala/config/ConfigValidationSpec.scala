package config

import zio.test.*
import zio.test.Assertion.*

object ConfigValidationSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("ConfigValidation")(
      test("validateNotebookPath accepts a normal absolute path") {
        assertZIO(ConfigValidation.validateNotebookPath("/tmp/spark-viz"))(equalTo("/tmp/spark-viz"))
      },
      test("validateNotebookPath decodes nested percent encoding") {
        assertZIO(ConfigValidation.validateNotebookPath("/tmp%252Fspark-viz"))(equalTo("/tmp/spark-viz"))
      },
      test("validateNotebookPath rejects relative paths") {
        assertZIO(ConfigValidation.validateNotebookPath("tmp/spark-viz").exit)(
          fails(containsString("Invalid notebook path format"))
        )
      },
      test("validateNotebookPath rejects traversal even after decoding") {
        assertZIO(ConfigValidation.validateNotebookPath("/%252e%252e/secret").exit)(
          fails(containsString("Invalid notebook path format"))
        )
      },
      test("validateNotebookPath rejects malformed encoding") {
        assertZIO(ConfigValidation.validateNotebookPath("/tmp/%").exit)(fails(containsString("Malformed URL encoding")))
      },
      test("validateNotebookPath rejects backslashes") {
        assertZIO(ConfigValidation.validateNotebookPath("/tmp\\spark-viz").exit)(
          fails(containsString("Invalid notebook path format"))
        )
      },
      test("validateDirectToken accepts a valid PAT token") {
        assertZIO(ConfigValidation.validateDirectToken("dapiTESTTOKEN-123456"))(equalTo("dapiTESTTOKEN-123456"))
      },
      test("validateDirectToken rejects an invalid PAT token") {
        assertZIO(ConfigValidation.validateDirectToken("invalid").exit)(
          fails(containsString("Invalid Databricks token format"))
        )
      }
    )
