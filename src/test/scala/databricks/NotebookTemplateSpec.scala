package databricks

import zio.*
import zio.test.*
import zio.test.Assertion.*

object NotebookTemplateSpec extends ZIOSpecDefault:

  override def spec: Spec[TestEnvironment & Scope, Any] =
    suite("NotebookTemplate")(
      test("loadDefault rewrites the lab1 path and skip flag") {
        assertZIO(
          NotebookTemplate.loadDefault(
            lab = "lab1",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp",
            skipRepartition = true
          )
        )(
          containsString("/Volumes/test/catalog/schema/sparkml_tmp") &&
            containsString("SKIP_REPARTITION = True") &&
            not(containsString("/Volumes/main/default/sparkml_tmp"))
        )
      },
      test("buildNotebook replaces a lab2 step block") {
        assertZIO(
          NotebookTemplate.buildNotebook(
            step = 2,
            editedCode = "df = df.select('TV', 'radio')",
            lab = "lab2",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
          )
        )(
          containsString("df = df.select('TV', 'radio')") &&
            not(containsString("original_step_2 = True")) &&
            containsString("/Volumes/test/catalog/schema/sparkml_tmp")
        )
      },
      test("buildNotebook injects the step 3 predicate for lab1") {
        assertZIO(
          NotebookTemplate.buildNotebook(
            step = 3,
            editedCode = "logs.filter(logs.value.contains(\"London\"))",
            lab = "lab1",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
          )
        )(
          containsString("INJECTED_FILTER_PREDICATE = 'London'") &&
            containsString("logs.filter(logs.value.contains(\"London\"))")
        )
      },
      test("buildNotebook falls back to '.jp' when no contains() is present") {
        assertZIO(
          NotebookTemplate.buildNotebook(
            step = 3,
            editedCode = "logs.filter(logs.value == \"Berlin\")",
            lab = "lab1",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
          )
        )(
          containsString("INJECTED_FILTER_PREDICATE = '.jp'")
        )
      },
      test("loadDefault fails for unregistered lab") {
        assertZIO(
          NotebookTemplate
            .loadDefault(
              lab = "lab_nonexistent",
              datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
            )
            .exit
        )(
          fails(anything)
        )
      },
      test("buildNotebook does NOT inject filter predicate for lab2") {
        assertZIO(
          NotebookTemplate.buildNotebook(
            step = 3,
            editedCode = "logs.filter(logs.value.contains(\"London\"))",
            lab = "lab2",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
          )
        )(
          not(containsString("INJECTED_FILTER_PREDICATE = 'London'"))
        )
      },
      test("buildNotebook handles multi-line edited code") {
        assertZIO(
          NotebookTemplate
            .buildNotebook(
              step = 2,
              editedCode = "line1 = 1\nline2 = 2\nline3 = 3",
              lab = "lab2",
              datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
            )
            .map { result =>
              val hasLine1 = result.contains("line1 = 1")
              val hasLine2 = result.contains("line2 = 2")
              val hasLine3 = result.contains("line3 = 3")
              hasLine1 && hasLine2 && hasLine3
            }
        )(isTrue)
      },
      test("buildNotebook ignores single-quote contains() calls") {
        assertZIO(
          NotebookTemplate.buildNotebook(
            step = 3,
            editedCode = "logs.filter(logs.value.contains('Berlin'))",
            lab = "lab1",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp"
          )
        )(
          containsString("INJECTED_FILTER_PREDICATE = '.jp'")
        )
      },
      test("loadDefault with skipRepartition=false keeps original flag") {
        assertZIO(
          NotebookTemplate.loadDefault(
            lab = "lab1",
            datasetVolumePath = "/Volumes/test/catalog/schema/sparkml_tmp",
            skipRepartition = false
          )
        )(
          containsString("SKIP_REPARTITION = False")
        )
      }
    )
