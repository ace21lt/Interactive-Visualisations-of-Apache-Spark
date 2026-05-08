package config

import zio.test.*
import zio.test.Assertion.*

object DatabricksConfigSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("DatabricksConfig")(
      test("directCredentials strips a trailing slash and enables direct mode") {
        val config = DatabricksConfig(
          workspaceUrl = Some("https://demo.databricks.com/"),
          token = Some("dapiTESTTOKEN-123456")
        )

        assertTrue(
          config.directCredentials.get == ("https://demo.databricks.com", "dapiTESTTOKEN-123456"),
          config.isDirectMode
        )
      },
      test("directCredentials is None when workspaceUrl or token is missing") {
        val missingToken = DatabricksConfig(workspaceUrl = Some("https://demo.databricks.com"), token = None)
        val missingHost  = DatabricksConfig(workspaceUrl = None, token = Some("dapiTESTTOKEN-123456"))

        assert(missingToken.directCredentials)(isNone) &&
        assertTrue(!missingToken.isDirectMode) &&
        assert(missingHost.directCredentials)(isNone) &&
        assertTrue(!missingHost.isDirectMode)
      },
      test("notebookImportDir returns the configured import base") {
        val config = DatabricksConfig(notebookImportBase = "/tmp/spark-viz-test")
        assertZIO(config.notebookImportDir)(equalTo("/tmp/spark-viz-test"))
      }
    )
