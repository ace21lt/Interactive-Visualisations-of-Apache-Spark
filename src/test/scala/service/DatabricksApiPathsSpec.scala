package service

import zio.test.*
import zio.test.Assertion.*

object DatabricksApiPathsSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment, Any] =
    suite("DatabricksApiPaths")(
      test("builds the jobs submit URL") {
        assertTrue(
          DatabricksApiPaths.buildSubmitUrl("https://workspace") == "https://workspace/api/2.1/jobs/runs/submit"
        )
      },
      test("builds the jobs get URL with a run id") {
        assertTrue(
          DatabricksApiPaths
            .buildGetRunUrl("https://workspace", 42L) == "https://workspace/api/2.1/jobs/runs/get?run_id=42"
        )
      },
      test("builds the jobs get-output URL with a run id") {
        assertTrue(
          DatabricksApiPaths
            .buildGetOutputUrl("https://workspace", 42L) == "https://workspace/api/2.1/jobs/runs/get-output?run_id=42"
        )
      },
      test("builds workspace and files URLs") {
        val importUrl       = DatabricksApiPaths.buildWorkspaceImportUrl("https://workspace")
        val mkdirsUrl       = DatabricksApiPaths.buildWorkspaceMkdirsUrl("https://workspace")
        val filesUrl        =
          DatabricksApiPaths.buildFilesUrl("https://workspace", "/Volumes/main/default/sparkml_tmp/data.csv")
        val encodedFilesUrl =
          DatabricksApiPaths.buildFilesUrl("https://workspace", "/Volumes/main/default/My File #1.csv")

        assertTrue(
          importUrl == "https://workspace/api/2.0/workspace/import",
          mkdirsUrl == "https://workspace/api/2.0/workspace/mkdirs",
          filesUrl == "https://workspace/api/2.0/fs/files/Volumes/main/default/sparkml_tmp/data.csv",
          encodedFilesUrl == "https://workspace/api/2.0/fs/files/Volumes/main/default/My%20File%20%231.csv"
        )
      }
    )
