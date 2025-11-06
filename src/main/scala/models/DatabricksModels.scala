package models

import zio.json.*

// JSON models for Databricks REST API communication
// All models use zio-json for type-safe serialization/deserialization
// @jsonField annotations convert camelCase to snake_case for Databricks API

// === Request Models ===

// Cluster configuration for creating new clusters (not used for serverless)
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
    @jsonField("task_key") taskKey: String,                // Unique task identifier
    @jsonField("notebook_task") notebookTask: NotebookTask // Notebook to execute
)

object TaskSpec:
  implicit val encoder: JsonEncoder[TaskSpec] = DeriveJsonEncoder.gen[TaskSpec]
  implicit val decoder: JsonDecoder[TaskSpec] = DeriveJsonDecoder.gen[TaskSpec]

// Request to submit a notebook run to Databricks
case class NotebookRunRequest(
    @jsonField("run_name") runName: String,                                // Unique run name
    tasks: Option[List[TaskSpec]] = None,                                  // For MULTI_TASK format (serverless)
    @jsonField("notebook_task") notebookTask: Option[NotebookTask] = None, // For SINGLE_TASK format
    @jsonField("new_cluster") newCluster: Option[NewCluster] = None,       // Cluster config (not for serverless)
    @jsonField("timeout_seconds") timeoutSeconds: Option[Int] = None,      // Overall timeout
    format: Option[String] = None                                          // "MULTI_TASK" for serverless
)

object NotebookRunRequest:
  implicit val encoder: JsonEncoder[NotebookRunRequest] = DeriveJsonEncoder.gen[NotebookRunRequest]
  implicit val decoder: JsonDecoder[NotebookRunRequest] = DeriveJsonDecoder.gen[NotebookRunRequest]

// === Response Models ===

// Response from submitting a notebook run
case class SubmitRunResponse(
    @jsonField("run_id") runId: Long // Unique run ID for polling status
)

object SubmitRunResponse:
  implicit val encoder: JsonEncoder[SubmitRunResponse] = DeriveJsonEncoder.gen[SubmitRunResponse]
  implicit val decoder: JsonDecoder[SubmitRunResponse] = DeriveJsonDecoder.gen[SubmitRunResponse]

// State information about a notebook run
case class RunState(
    @jsonField("life_cycle_state") lifeCycleState: String,          // PENDING, RUNNING, TERMINATING, TERMINATED
    @jsonField("result_state") resultState: Option[String] = None,  // SUCCESS, FAILED, etc.
    @jsonField("state_message") stateMessage: Option[String] = None // Error details if failed
)

object RunState:
  implicit val encoder: JsonEncoder[RunState] = DeriveJsonEncoder.gen[RunState]
  implicit val decoder: JsonDecoder[RunState] = DeriveJsonDecoder.gen[RunState]

// Response from polling run status
case class RunStatusResponse(
    @jsonField("run_id") runId: Long, // The run ID we're checking
    state: RunState                   // Current state
)

object RunStatusResponse:
  implicit val encoder: JsonEncoder[RunStatusResponse] = DeriveJsonEncoder.gen[RunStatusResponse]
  implicit val decoder: JsonDecoder[RunStatusResponse] = DeriveJsonDecoder.gen[RunStatusResponse]

// Task information in run details (for MULTI_TASK format)
case class TaskRun(
    @jsonField("run_id") runId: Long,  // Task-specific run ID
    @jsonField("task_key") taskKey: String // Task identifier
)

object TaskRun:
  implicit val encoder: JsonEncoder[TaskRun] = DeriveJsonEncoder.gen[TaskRun]
  implicit val decoder: JsonDecoder[TaskRun] = DeriveJsonDecoder.gen[TaskRun]

// Response from getting run details (includes tasks for MULTI_TASK)
case class RunDetailsResponse(
    @jsonField("run_id") runId: Long,           // Main run ID
    tasks: Option[List[TaskRun]] = None         // Task runs (for MULTI_TASK format)
)

object RunDetailsResponse:
  implicit val encoder: JsonEncoder[RunDetailsResponse] = DeriveJsonEncoder.gen[RunDetailsResponse]
  implicit val decoder: JsonDecoder[RunDetailsResponse] = DeriveJsonDecoder.gen[RunDetailsResponse]

// === Service Output Models (for our API responses) ===

// Notebook execution output (from dbutils.notebook.exit())
case class NotebookOutput(
    logs: Option[String] = None,  // Execution logs
    error: Option[String] = None, // Error message if failed
    result: Option[String] = None // JSON result from notebook (Cell 6 output)
)

// Final output returned by our API to the frontend
case class RunOutput(
    runId: Long,                   // Databricks run ID
    state: String,                 // SUCCESS, FAILED, TIMEOUT
    output: Option[NotebookOutput] // Notebook results for visualization
)
