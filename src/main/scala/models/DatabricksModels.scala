package models

import zio.json.*

// JSON models for Databricks REST API communication
// All models use zio-json for type-safe serialisation/deserialisation
// @jsonField annotations convert camelCase to snake_case for Databricks API

// request models

// Cluster configuration for creating new clusters
case class NewCluster(
    @jsonField("spark_version") sparkVersion: String, // Databricks runtime version
    @jsonField("node_type_id") nodeTypeId: String,    // AWS/Azure instance type
    @jsonField("num_workers") numWorkers: Int         // 0 = single-node cluster
)

object NewCluster:
  implicit val encoder: JsonEncoder[NewCluster] = DeriveJsonEncoder.gen[NewCluster]
  implicit val decoder: JsonDecoder[NewCluster] = DeriveJsonDecoder.gen[NewCluster]

// Notebook task configuration specifying which notebook to run
case class NotebookTask(
    @jsonField("notebook_path") notebookPath: String,                                // Absolute path in workspace
    @jsonField("base_parameters") baseParameters: Option[Map[String, String]] = None // Optional notebook params
)

object NotebookTask:
  implicit val encoder: JsonEncoder[NotebookTask] = DeriveJsonEncoder.gen[NotebookTask]
  implicit val decoder: JsonDecoder[NotebookTask] = DeriveJsonDecoder.gen[NotebookTask]

// Task specification for MULTI_TASK format (required for serverless)
case class TaskSpec(
    @jsonField("task_key") taskKey: String,
    @jsonField("notebook_task") notebookTask: NotebookTask // Notebook to execute
)

object TaskSpec:
  implicit val encoder: JsonEncoder[TaskSpec] = DeriveJsonEncoder.gen[TaskSpec]
  implicit val decoder: JsonDecoder[TaskSpec] = DeriveJsonDecoder.gen[TaskSpec]

// Request to submit a notebook run to Databricks
case class NotebookRunRequest(
    @jsonField("run_name") runName: String,
    tasks: Option[List[TaskSpec]] = None,                                  // For MULTI_TASK format
    @jsonField("notebook_task") notebookTask: Option[NotebookTask] = None, // For SINGLE_TASK format
    @jsonField("new_cluster") newCluster: Option[NewCluster] = None,
    @jsonField("timeout_seconds") timeoutSeconds: Option[Int] = None,
    format: Option[String] = None
)

object NotebookRunRequest:
  implicit val encoder: JsonEncoder[NotebookRunRequest] = DeriveJsonEncoder.gen[NotebookRunRequest]
  implicit val decoder: JsonDecoder[NotebookRunRequest] = DeriveJsonDecoder.gen[NotebookRunRequest]

// === Response Models ===

// Response from submitting a notebook run
case class SubmitRunResponse(
    @jsonField("run_id") runId: Long
)

object SubmitRunResponse:
  implicit val encoder: JsonEncoder[SubmitRunResponse] = DeriveJsonEncoder.gen[SubmitRunResponse]
  implicit val decoder: JsonDecoder[SubmitRunResponse] = DeriveJsonDecoder.gen[SubmitRunResponse]

// State information about a notebook run
case class RunState(
    @jsonField("life_cycle_state") lifeCycleState: String,
    @jsonField("result_state") resultState: Option[String] = None,
    @jsonField("state_message") stateMessage: Option[String] = None
)

object RunState:
  implicit val encoder: JsonEncoder[RunState] = DeriveJsonEncoder.gen[RunState]
  implicit val decoder: JsonDecoder[RunState] = DeriveJsonDecoder.gen[RunState]

// Response from polling run status
case class RunStatusResponse(
    @jsonField("run_id") runId: Long,
    state: RunState
)

object RunStatusResponse:
  implicit val encoder: JsonEncoder[RunStatusResponse] = DeriveJsonEncoder.gen[RunStatusResponse]
  implicit val decoder: JsonDecoder[RunStatusResponse] = DeriveJsonDecoder.gen[RunStatusResponse]

// Task run information for MULTI_TASK format
case class TaskRun(
    @jsonField("run_id") runId: Long,
    @jsonField("task_key") taskKey: String
)

object TaskRun:
  implicit val encoder: JsonEncoder[TaskRun] = DeriveJsonEncoder.gen[TaskRun]
  implicit val decoder: JsonDecoder[TaskRun] = DeriveJsonDecoder.gen[TaskRun]

// Response from getting run details (includes task runs)
case class RunDetailsResponse(
    @jsonField("run_id") runId: Long,
    state: RunState,
    tasks: Option[List[TaskRun]]
)

object RunDetailsResponse:
  implicit val encoder: JsonEncoder[RunDetailsResponse] = DeriveJsonEncoder.gen[RunDetailsResponse]
  implicit val decoder: JsonDecoder[RunDetailsResponse] = DeriveJsonDecoder.gen[RunDetailsResponse]

// Metadata for notebook output (contains the actual result string)
case class NotebookOutputMetadata(
    @jsonField("notebook_output") notebookOutput: Option[NotebookOutputData] = None
)

object NotebookOutputMetadata:
  implicit val encoder: JsonEncoder[NotebookOutputMetadata] = DeriveJsonEncoder.gen[NotebookOutputMetadata]
  implicit val decoder: JsonDecoder[NotebookOutputMetadata] = DeriveJsonDecoder.gen[NotebookOutputMetadata]

// Notebook output data with result, truncated flag, and type
case class NotebookOutputData(
    result: Option[String] = None,
    truncated: Option[Boolean] = None,
    @jsonField("output_type") outputType: Option[String] = None
)

object NotebookOutputData:
  implicit val encoder: JsonEncoder[NotebookOutputData] = DeriveJsonEncoder.gen[NotebookOutputData]
  implicit val decoder: JsonDecoder[NotebookOutputData] = DeriveJsonDecoder.gen[NotebookOutputData]

// Response from get-output API endpoint
case class NotebookOutputResponse(
    metadata: Option[NotebookOutputMetadata] = None,
    error: Option[String] = None,
    @jsonField("error_trace") errorTrace: Option[String] = None
)

object NotebookOutputResponse:
  implicit val encoder: JsonEncoder[NotebookOutputResponse] = DeriveJsonEncoder.gen[NotebookOutputResponse]
  implicit val decoder: JsonDecoder[NotebookOutputResponse] = DeriveJsonDecoder.gen[NotebookOutputResponse]

// Service Output Models

// Notebook execution output
case class NotebookOutput(
    logs: Option[String] = None,
    error: Option[String] = None,
    result: Option[String] = None
)

// Final output returned by our API to the frontend
case class RunOutput(
    runId: Long,
    state: String,
    output: Option[NotebookOutput]
)
