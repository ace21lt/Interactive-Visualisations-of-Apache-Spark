package models

import zio.json.*

// Cluster configuration for creating new clusters
case class NewCluster(
    @jsonField("spark_version") sparkVersion: String,
    @jsonField("node_type_id") nodeTypeId: String,
    @jsonField("num_workers") numWorkers: Int
)

object NewCluster:
  given JsonEncoder[NewCluster] = DeriveJsonEncoder.gen[NewCluster]
  given JsonDecoder[NewCluster] = DeriveJsonDecoder.gen[NewCluster]

case class NotebookTask(
    @jsonField("notebook_path") notebookPath: String,
    @jsonField("base_parameters") baseParameters: Option[Map[String, String]] = None
)

object NotebookTask:
  given JsonEncoder[NotebookTask] = DeriveJsonEncoder.gen[NotebookTask]
  given JsonDecoder[NotebookTask] = DeriveJsonDecoder.gen[NotebookTask]

// Task specification for MULTI_TASK format (required for serverless)
case class TaskSpec(
    @jsonField("task_key") taskKey: String,
    @jsonField("notebook_task") notebookTask: NotebookTask
)

object TaskSpec:
  given JsonEncoder[TaskSpec] = DeriveJsonEncoder.gen[TaskSpec]
  given JsonDecoder[TaskSpec] = DeriveJsonDecoder.gen[TaskSpec]

case class NotebookRunRequest(
    @jsonField("run_name") runName: String,
    tasks: Option[List[TaskSpec]] = None,
    @jsonField("notebook_task") notebookTask: Option[NotebookTask] = None,
    @jsonField("new_cluster") newCluster: Option[NewCluster] = None,
    @jsonField("timeout_seconds") timeoutSeconds: Option[Int] = None,
    format: Option[String] = None
)

object NotebookRunRequest:
  given JsonEncoder[NotebookRunRequest] = DeriveJsonEncoder.gen[NotebookRunRequest]
  given JsonDecoder[NotebookRunRequest] = DeriveJsonDecoder.gen[NotebookRunRequest]

case class WorkspaceImportRequest(
    path: String,
    format: String = "SOURCE",
    language: String = "PYTHON",
    content: String,
    overwrite: Boolean = true
)
object WorkspaceImportRequest:
  given JsonEncoder[WorkspaceImportRequest] = DeriveJsonEncoder.gen[WorkspaceImportRequest]
  given JsonDecoder[WorkspaceImportRequest] = DeriveJsonDecoder.gen[WorkspaceImportRequest]

case class WorkspaceImportResponse()
object WorkspaceImportResponse:
  given JsonDecoder[WorkspaceImportResponse] = DeriveJsonDecoder.gen[WorkspaceImportResponse]

case class SubmitRunResponse(@jsonField("run_id") runId: Long)
object SubmitRunResponse:
  given JsonEncoder[SubmitRunResponse] = DeriveJsonEncoder.gen[SubmitRunResponse]
  given JsonDecoder[SubmitRunResponse] = DeriveJsonDecoder.gen[SubmitRunResponse]

case class RunState(
    @jsonField("life_cycle_state") lifeCycleState: String,
    @jsonField("result_state") resultState: Option[String] = None,
    @jsonField("state_message") stateMessage: Option[String] = None
)

object RunState:
  given JsonEncoder[RunState] = DeriveJsonEncoder.gen[RunState]
  given JsonDecoder[RunState] = DeriveJsonDecoder.gen[RunState]

// start_time and end_time are Unix ms timestamps from the Databricks API
case class RunStatusResponse(
    @jsonField("run_id") runId: Long,
    state: RunState,
    @jsonField("start_time") startTime: Option[Long] = None,
    @jsonField("end_time") endTime: Option[Long] = None
)

object RunStatusResponse:
  given JsonEncoder[RunStatusResponse] = DeriveJsonEncoder.gen[RunStatusResponse]
  given JsonDecoder[RunStatusResponse] = DeriveJsonDecoder.gen[RunStatusResponse]

// Task run information for MULTI_TASK format
case class TaskRun(
    @jsonField("run_id") runId: Long,
    @jsonField("task_key") taskKey: String
)

object TaskRun:
  given JsonEncoder[TaskRun] = DeriveJsonEncoder.gen[TaskRun]
  given JsonDecoder[TaskRun] = DeriveJsonDecoder.gen[TaskRun]

case class RunDetailsResponse(
    @jsonField("run_id") runId: Long,
    state: RunState,
    tasks: Option[List[TaskRun]]
)

object RunDetailsResponse:
  given JsonEncoder[RunDetailsResponse] = DeriveJsonEncoder.gen[RunDetailsResponse]
  given JsonDecoder[RunDetailsResponse] = DeriveJsonDecoder.gen[RunDetailsResponse]

case class NotebookOutputMetadata(
    @jsonField("notebook_output") notebookOutput: Option[NotebookOutputData] = None
)

object NotebookOutputMetadata:
  given JsonEncoder[NotebookOutputMetadata] = DeriveJsonEncoder.gen[NotebookOutputMetadata]
  given JsonDecoder[NotebookOutputMetadata] = DeriveJsonDecoder.gen[NotebookOutputMetadata]

case class NotebookOutputData(
    result: Option[String] = None,
    truncated: Option[Boolean] = None,
    @jsonField("output_type") outputType: Option[String] = None
)

object NotebookOutputData:
  given JsonEncoder[NotebookOutputData] = DeriveJsonEncoder.gen[NotebookOutputData]
  given JsonDecoder[NotebookOutputData] = DeriveJsonDecoder.gen[NotebookOutputData]

case class NotebookOutputResponse(
    metadata: Option[NotebookOutputMetadata] = None,
    error: Option[String] = None,
    @jsonField("error_trace") errorTrace: Option[String] = None
)

object NotebookOutputResponse:
  given JsonEncoder[NotebookOutputResponse] = DeriveJsonEncoder.gen[NotebookOutputResponse]
  given JsonDecoder[NotebookOutputResponse] = DeriveJsonDecoder.gen[NotebookOutputResponse]

case class NotebookOutput(
    logs: Option[String] = None,
    error: Option[String] = None,
    result: Option[String] = None
)

case class RunOutput(
    runId: Long,
    state: String,
    output: Option[NotebookOutput],
    executionSeconds: Option[Long] = None // (end_time - start_time) / 1000 from Databricks API
)
