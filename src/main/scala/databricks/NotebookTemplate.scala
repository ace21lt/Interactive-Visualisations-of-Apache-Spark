package databricks

import service.DatabricksError
import zio.*

// Loads Lab notebook templates from the backend classpath and optionally
// substitutes a user-edited step block and the dataset volume path before
// the notebook is imported to a student's workspace.

// Templates live in src/main/resources/ as Python files.
// The hardcoded dataset path placeholder in each template is replaced at
// runtime with the configured DATASET_VOLUME_PATH, so the same template
// works against any student's Unity Catalog volume.

// SPARK-VIZ-STEP-N-BEGIN/END markers wrap each editable section.
object NotebookTemplate:

  // The placeholder path written in the template source.
  // Replaced at runtime with config.datasetVolumePath.
  private val TemplatePath = "/Volumes/main/default/sparkml_tmp"

  private val templates: Map[String, String] = Map(
    "lab1" -> "lab1_notebook_template.py"
  )

  private val DefaultLab = "lab1"

  // Load the template, substitute the dataset volume path, and optionally
  // set SKIP_REPARTITION=True to bypass the Delta write for faster runs.
  def loadDefault(
      lab: String = DefaultLab,
      datasetVolumePath: String = TemplatePath,
      skipRepartition: Boolean = false
  ): IO[DatabricksError, String] =
    templates.get(lab) match
      case None       => ZIO.fail(DatabricksError.ConfigError(s"No template registered for lab '$lab'"))
      case Some(name) =>
        loadResource(name)
          .map(injectDatasetPath(_, datasetVolumePath))
          .map(injectSkipRepartition(_, skipRepartition))

  // Load the template, substitute the dataset path, then substitute a step block.
  // skipRepartition is always false here — if the student is editing step 2,
  // the Delta write must run to apply their partition count change.
  def buildNotebook(
      step: Int,
      editedCode: String,
      lab: String = DefaultLab,
      datasetVolumePath: String = TemplatePath
  ): IO[DatabricksError, String] =
    val skipRepartition = step != 2 // only rewrite Delta when student edits step 2
    for
      template <- loadDefault(lab, datasetVolumePath, skipRepartition)
      result   <- ZIO
                    .fromEither(substituteStep(template, step, editedCode))
                    .mapError(DatabricksError.ConfigError(_))
    yield injectFilterPredicate(result, step, editedCode)

  // Replace the hardcoded template path with the student's configured volume path.
  // All three path variables in CELL 1 are updated in one pass.
  private def injectDatasetPath(template: String, datasetVolumePath: String): String =
    val normalised = datasetVolumePath.stripSuffix("/")
    template.replace(TemplatePath, normalised)

  // When the student is not editing step 2, the Delta table from the previous
  // run already exists with the correct partition count
  private def injectSkipRepartition(template: String, skipRepartition: Boolean): String =
    if skipRepartition then template.replace("SKIP_REPARTITION = False", "SKIP_REPARTITION = True")
    else template

  // When the student edits step 3, extract the predicate string from their code
  // and inject it as INJECTED_FILTER_PREDICATE so the notebook never has to
  // parse the JVM query plan.
  private def injectFilterPredicate(template: String, step: Int, editedCode: String): String =
    if step != 3 then template
    else
      val predicate = extractContainsPredicate(editedCode).getOrElse(".jp")
      template.replace("INJECTED_FILTER_PREDICATE = \'.jp\'", s"INJECTED_FILTER_PREDICATE = \'$predicate\'")

  private def extractContainsPredicate(code: String): Option[String] =
    raw"""\.contains\("([^"]+)"\)""".r.findFirstMatchIn(code).map(_.group(1))

  private def loadResource(resourceName: String): IO[DatabricksError, String] =
    ZIO
      .attempt {
        val stream = getClass.getClassLoader.getResourceAsStream(resourceName)
        if stream == null then
          throw new IllegalStateException(
            s"Notebook template not found on classpath: $resourceName. " +
              s"Ensure it is placed under src/main/resources/ before building."
          )
        val bytes  = stream.readAllBytes()
        stream.close()
        new String(bytes, "UTF-8")
      }
      .mapError(e =>
        DatabricksError.ConfigError(
          s"Failed to load notebook template '$resourceName': ${e.getMessage}"
        )
      )

  private def substituteStep(
      template: String,
      step: Int,
      editedCode: String
  ): Either[String, String] =
    val beginMarker = s"# SPARK-VIZ-STEP-$step-BEGIN"
    val endMarker   = s"# SPARK-VIZ-STEP-$step-END"
    val lines       = template.split("\n", -1).toList

    val beginIdx = lines.indexWhere(_.trim == beginMarker)
    val endIdx   = lines.indexWhere(_.trim == endMarker)

    if beginIdx < 0 then Left(s"BEGIN marker not found for step $step")
    else if endIdx < 0 then Left(s"END marker not found for step $step")
    else if endIdx <= beginIdx then Left(s"END marker appears before BEGIN for step $step")
    else
      val before      = lines.take(beginIdx + 1)
      val after       = lines.drop(endIdx)
      val editedLines = editedCode.split("\n", -1).toList
      Right((before ++ editedLines ++ after).mkString("\n"))
