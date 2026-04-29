package service

import config.DatabricksConfig
import databricks.{
  DatasetProvisioner,
  JobStatusChecker,
  JobSubmitter,
  NotebookTemplate,
  OutputFetcher,
  WorkspaceImporter
}
import models.*
import zio.*

trait DatabricksService:
  def runLab(
      workspaceUrl: String,
      token: String,
      lab: String = "lab1",
      step: Option[Int] = None,
      editedCode: Option[String] = None
  ): IO[DatabricksError, RunOutput]

object DatabricksService:
  def runLab(
      workspaceUrl: String,
      token: String,
      lab: String = "lab1",
      step: Option[Int] = None,
      editedCode: Option[String] = None
  ): ZIO[DatabricksService, DatabricksError, RunOutput] =
    ZIO.serviceWithZIO[DatabricksService](_.runLab(workspaceUrl, token, lab, step, editedCode))

// On every call:
//   1. Auto-discover the student's Unity Catalog catalog name
//      Ensure dataset files exist at /Volumes/{catalog}/default/sparkml_tmp/
//   2. Load the notebook template and inject the resolved volume path
//      Optionally substitute the student's edited step block
//   3. Import the notebook to a fresh timestamped path in the student's workspace
//   4. Submit, poll, fetch output
case class DatabricksServiceLive(
    config: DatabricksConfig,
    jobSubmitter: JobSubmitter,
    jobStatusChecker: JobStatusChecker,
    outputFetcher: OutputFetcher,
    workspaceImporter: WorkspaceImporter,
    datasetProvisioner: DatasetProvisioner
) extends DatabricksService:

  override def runLab(
      workspaceUrl: String,
      token: String,
      lab: String,
      step: Option[Int],
      editedCode: Option[String]
  ): IO[DatabricksError, RunOutput] =
    for
      // Step 1 — auto-discover catalog, ensure datasets exist, get resolved path
      _         <- ZIO.logInfo(s"Discovering catalog and ensuring datasets: $workspaceUrl")
      provision <- datasetProvisioner.ensureDatasets(workspaceUrl, token)
      volumePath = provision.volumePath
      _         <- ZIO.logInfo(s"Using volume path: $volumePath")

      // Step 2 — build notebook source with the resolved volume path injected.
      // skipRepartition is only relevant for lab1; for other labs it defaults false.
      notebookSource <- (step, editedCode) match
                          case (Some(s), Some(code)) if code.trim.nonEmpty =>
                            ZIO.logInfo(s"Building notebook [$lab] with edited step $s") *>
                              NotebookTemplate.buildNotebook(s, code, lab = lab, datasetVolumePath = volumePath)
                          case _                                           =>
                            val skip = lab == "lab1" && provision.deltaTableExists
                            ZIO.logInfo(
                              s"Building notebook [$lab] from template " +
                                s"(skipRepartition=$skip, deltaTableExists=${provision.deltaTableExists})"
                            ) *>
                              NotebookTemplate.loadDefault(
                                lab = lab,
                                datasetVolumePath = volumePath,
                                skipRepartition = skip
                              )

      // Step 3 — import notebook to a fresh path in the student's workspace
      importDir      <- config.notebookImportDir
      destPath        = WorkspaceImporter.destinationPath(importDir)
      _              <- ZIO.logInfo(s"Importing notebook [$lab] to $workspaceUrl at $destPath")
      _              <- workspaceImporter.importNotebook(workspaceUrl, token, destPath, notebookSource)

      // Step 4 — run it
      result <- executeAt(workspaceUrl, token, destPath)
    yield result

  private def executeAt(
      workspaceUrl: String,
      token: String,
      notebookPath: String
  ): IO[DatabricksError, RunOutput] =
    for
      runId          <- jobSubmitter.submitJob(workspaceUrl, token, notebookPath)
      _              <- ZIO.logInfo(s"Run submitted: $runId")
      status         <- jobStatusChecker.waitForCompletion(workspaceUrl, token, runId)
      _              <- ZIO.logInfo(s"Run completed: ${status.state}")
      taskRunId      <- jobStatusChecker.getTaskRunId(workspaceUrl, token, runId)
      notebookOutput <- outputFetcher.fetchOutput(workspaceUrl, token, taskRunId)
    yield status.copy(output = notebookOutput)

object DatabricksServiceLive:
  val layer: ZLayer[
    DatabricksConfig & JobSubmitter & JobStatusChecker & OutputFetcher & WorkspaceImporter & DatasetProvisioner,
    Nothing,
    DatabricksService
  ] = ZLayer.fromFunction(DatabricksServiceLive.apply _)
