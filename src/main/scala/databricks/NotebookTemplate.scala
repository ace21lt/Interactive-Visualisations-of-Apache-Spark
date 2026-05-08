package databricks

import service.DatabricksError
import zio.*

// Helpers to load and adapt Python notebook templates used by the labs.
object NotebookTemplate:

  // Hardcoded placeholder in template files; replaced with the student's volume path.
  private val TemplatePath = "/Volumes/main/default/sparkml_tmp"

  // Map lab id -> resource filename (keep in sync with frontend LABS).
  private val templates: Map[String, String] = Map(
    "lab1" -> "lab1_notebook_template.py",
    "lab2" -> "lab2_notebook_template.py"
  )

  private val DefaultLab = "lab1"

  // Load a template, replace dataset path, and optionally set SKIP_REPARTITION for lab1.
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
          .map(t => if lab == "lab1" then injectSkipRepartition(t, skipRepartition) else t)

  // Build a notebook with an injected student code block for `step`.
  def buildNotebook(
      step: Int,
      editedCode: String,
      lab: String = DefaultLab,
      datasetVolumePath: String = TemplatePath
  ): IO[DatabricksError, String] =
    val skipRepartition = lab == "lab1" && step != 2 // don't rewrite Delta unless editing step 2
    for
      template <- loadDefault(lab, datasetVolumePath, skipRepartition)
      result   <- ZIO.fromEither(substituteStep(template, step, editedCode)).mapError(DatabricksError.ConfigError(_))
    yield if lab == "lab1" then injectFilterPredicate(result, step, editedCode) else result

  // Replace placeholder path in the loaded template.
  private def injectDatasetPath(template: String, datasetVolumePath: String): String =
    val normalised = datasetVolumePath.stripSuffix("/")
    template.replace(TemplatePath, normalised)

  // Flip SKIP_REPARTITION flag when we want to avoid a repartition run.
  private def injectSkipRepartition(template: String, skipRepartition: Boolean): String =
    if skipRepartition then template.replace("SKIP_REPARTITION = False", "SKIP_REPARTITION = True")
    else template

  // If editing step 3, extract a contains(...) predicate and inject it into the template.
  private def injectFilterPredicate(template: String, step: Int, editedCode: String): String =
    if step != 3 then template
    else
      val predicate = extractContainsPredicate(editedCode).getOrElse(".jp")
      template.replace("INJECTED_FILTER_PREDICATE = '.jp'", s"INJECTED_FILTER_PREDICATE = '$predicate'")

  // Find the string inside a .contains("...") call.
  private def extractContainsPredicate(code: String): Option[String] =
    raw"""\.contains\("([^"]+)"\)""".r.findFirstMatchIn(code).map(_.group(1))

  // Load a resource file from the classpath as UTF-8.
  private def loadResource(resourceName: String): IO[DatabricksError, String] =
    ZIO
      .attempt {
        val stream = getClass.getClassLoader.getResourceAsStream(resourceName)
        if stream == null then
          throw new IllegalStateException(s"Notebook template not found on classpath: $resourceName")
        val bytes  = stream.readAllBytes()
        stream.close()
        new String(bytes, "UTF-8")
      }
      .mapError(e => DatabricksError.ConfigError(s"Failed to load notebook template '$resourceName': ${e.getMessage}"))

  // Replace lines between BEGIN/END markers for the supplied step with editedCode.
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
