# COM6012 - Lab 2: RDD, DataFrame, ML Pipeline — Databricks Notebook (SERVERLESS)
# Spark handles distributed data loading, schema inference, partitioning, and randomSplit.
# scikit-learn handles ML on the driver — 200 rows fits trivially in memory.
# On Databricks Serverless via the Jobs API, spark.ml constructors are blocked by the
# Py4J whitelist (Spark Connect execution context). This hybrid Spark + scikit-learn
# approach is standard practice for small-dataset ML on Serverless.

# CELL 1 — File paths & Spark version
csv_path = "/Volumes/main/default/sparkml_tmp/Advertising.csv"

spark_version = spark.version
print(f"Spark version: {spark_version}")

# CELL 2 — RDD Concepts (conceptual only as RDDs unavailable on Serverless)
# Pi estimation using DataFrame API (Serverless-safe replacement for sc.parallelize)
from pyspark.sql.functions import spark_partition_id
import time as _time
import math as _math

# SPARK-VIZ-STEP-1-BEGIN
# Optional Exercise (Lab Section 5):
#   1. Vary NUM_PARTITIONS (e.g. 2, 4, 8, 16) and observe elapsed_ms vs partitions
#   2. Vary NUM_SAMPLES (e.g. 100_000, 1_000_000, 10_000_000) for precision vs time
NUM_SAMPLES = 10000000
NUM_PARTITIONS = 8

_pi_start = _time.time()
_pi_range = spark.range(NUM_SAMPLES, numPartitions=NUM_PARTITIONS)
pi_partition_count = _pi_range.select(spark_partition_id()).distinct().count()

pi_count = (
    _pi_range
    .selectExpr("rand() as x", "rand() as y")
    .filter("x*x + y*y < 1")
    .count()
)
pi_estimate = 4.0 * pi_count / NUM_SAMPLES
pi_elapsed_ms = int((_time.time() - _pi_start) * 1000)
pi_error = abs(pi_estimate - _math.pi)
# SPARK-VIZ-STEP-1-END

print(f"Pi estimate ({NUM_SAMPLES} samples, {pi_partition_count} partitions): {pi_estimate:.6f} in {pi_elapsed_ms}ms")

rdd_concepts = {
    "parallelized_collections": {
        "description": "sc.parallelize(data) distributes a local Python list across cluster nodes as an RDD — a collection of elements partitioned for parallel processing.",
        "example_code": "data = [1, 2, 3, 4, 5]\nrddData = sc.parallelize(data)\nrddData.collect()  # [1, 2, 3, 4, 5]",
        "serverless_note": "RDD API is unavailable on Databricks Serverless. Use DataFrames instead: spark.createDataFrame([(x,) for x in data], ['value'])"
    },
    "broadcast_variables": {
        "description": "Broadcast variables cache a read-only copy of a large variable on every worker node, avoiding redundant copies per task. Useful for lookup tables or model parameters.",
        "example_code": "broadcastVar = sc.broadcast([1, 2, 3])\nbroadcastVar.value  # [1, 2, 3]",
        "serverless_note": "Not available on Serverless. For DataFrames, Spark automatically broadcasts small tables during joins (broadcast hash join)."
    },
    "accumulators": {
        "description": "Accumulators are write-only shared variables — workers can add() to them, but only the driver can read the value. Used for distributed counters and sums.",
        "example_code": "accum = sc.accumulator(0)\nsc.parallelize([1, 2, 3, 4]).foreach(lambda x: accum.add(x))\naccum.value  # 10",
        "serverless_note": "Not available on Serverless. Use DataFrame aggregations instead: df.agg(sum('col'))."
    },
    "pi_estimation": {
        "description": "Monte Carlo pi estimation: scatter random (x,y) points in the unit square, count how many fall inside the unit circle (x*x+y*y<1). The fraction is approximately pi/4.",
        "example_code": "from random import random\ndef inside(p):\n    x, y = random(), random()\n    return x*x + y*y < 1\nNUM_SAMPLES = 10000000\ncount = sc.parallelize(range(0, NUM_SAMPLES), 8).filter(inside).count()\nprint('Pi is roughly %%f' %% (4.0 * count / NUM_SAMPLES))",
        "serverless_note": "Requires sc.parallelize — on Serverless we use spark.range() with rand() UDFs instead.",
        "serverless_result": pi_estimate
    }
}

# CELL 3 — Load Advertising CSV and explore DataFrame
from pyspark.sql.functions import spark_partition_id, col, count, array
from pyspark.ml.functions import array_to_vector

# SPARK-VIZ-STEP-2-BEGIN
df_raw = spark.read.load(csv_path, format="csv", inferSchema="true", header="true")
df = df_raw.drop("_c0")  # Remove the unnamed index column
# SPARK-VIZ-STEP-2-END

# Capture schema info
schema_fields = [{"name": f.name, "type": str(f.dataType), "nullable": f.nullable} for f in df.schema.fields]
raw_schema_fields = [{"name": f.name, "type": str(f.dataType), "nullable": f.nullable} for f in df_raw.schema.fields]

# Summary statistics
describe_rows = [row.asDict() for row in df.describe().collect()]

# Sample data
sample_rows = [row.asDict() for row in df.limit(10).collect()]
total_rows = df.count()

# Partition info for CSV
try:
    csv_partition_count = df.select(spark_partition_id()).distinct().count()
except Exception:
    csv_partition_count = 1

# Capture partition distribution right after CSV load, used by spark_internals
partition_dist_after_read = [
    row.asDict() for row in
    df.withColumn("pid", spark_partition_id())
    .groupBy("pid").agg(count("*").alias("row_count"))
    .orderBy("pid").collect()
]
# Rename pid -> partition_id for frontend schema consistency
partition_dist_after_read = [
    {"partition_id": r["pid"], "row_count": r["row_count"]}
    for r in partition_dist_after_read
]

print(f"Advertising CSV: {total_rows} rows, {len(schema_fields)} columns, {csv_partition_count} partition(s)")

# CELL 4 — Feature column selection
# On HPC/classic Spark you would use VectorAssembler here. On Serverless via
# the Jobs API, spark.ml constructors are blocked by the Py4J whitelist.
# so instead you select columns with DataFrame API and .toPandas() later for scikit-learn.

# SPARK-VIZ-STEP-3-BEGIN
feature_cols = ["TV", "radio", "newspaper"]
label_col = "sales"
df_selected = df.select(*feature_cols, col(label_col).alias("label"))
# SPARK-VIZ-STEP-3-END

features_sample = [row.asDict() for row in df_selected.limit(5).collect()]
# Full dataset for scatter plots — 200 rows is trivially small
features_all = [row.asDict() for row in df_selected.collect()]
print(f"Feature columns: {feature_cols}")
print(f"Sample: {features_sample[:2]}")

# CELL 5 — Train/Test Split (Spark randomSplit - narrow transformation, no shuffle)
# SPARK-VIZ-STEP-4-BEGIN
split_ratio = [0.6, 0.4]
split_seed = 6012
(trainingData, testData) = df_selected.randomSplit(split_ratio, split_seed)
# SPARK-VIZ-STEP-4-END

train_count = trainingData.count()
test_count = testData.count()

# Partition distribution of train and test sets
# Partition distributions — use row_count as the field name (consistent with
# spark_internals.partition_distribution)
train_partition_dist_raw = [
    row.asDict() for row in
    trainingData.withColumn("pid", spark_partition_id())
    .groupBy("pid").agg(count("*").alias("row_count"))
    .orderBy("pid").collect()
]
train_partition_dist = [
    {"partition_id": r["pid"], "row_count": r["row_count"]}
    for r in train_partition_dist_raw
]
test_partition_dist_raw = [
    row.asDict() for row in
    testData.withColumn("pid", spark_partition_id())
    .groupBy("pid").agg(count("*").alias("row_count"))
    .orderBy("pid").collect()
]
test_partition_dist = [
    {"partition_id": r["pid"], "row_count": r["row_count"]}
    for r in test_partition_dist_raw
]

# Convert to pandas for scikit-learn — .toPandas() collects all rows to driver.
# With 200 rows this is trivial; for large datasets you would use spark.ml instead.
# Add partition_id column BEFORE toPandas so the frontend can show which Spark
# partition each row came from — makes the collect operation "glass-box".
train_pdf = trainingData.withColumn("partition_id", spark_partition_id()).toPandas()
test_pdf = testData.withColumn("partition_id", spark_partition_id()).toPandas()

train_sample = [row.asDict() for row in trainingData.limit(5).collect()]
test_sample = [row.asDict() for row in testData.limit(5).collect()]

# Row-level split assignment for partition-aware visualisation
# Shows which rows the deterministic hash assigned to train vs test
import pandas as pd

_train_tagged = train_pdf.copy()
_train_tagged['_split'] = 'train'
_test_tagged = test_pdf.copy()
_test_tagged['_split'] = 'test'
split_rows = pd.concat([_train_tagged, _test_tagged], ignore_index=True).to_dict(orient='records')

print(f"Train: {train_count} rows ({len(train_partition_dist)} partition(s))")
print(f"Test:  {test_count} rows ({len(test_partition_dist)} partition(s))")

# CELL 6 — Linear Regression: Fit + Predict + Evaluate (scikit-learn)
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_squared_error, r2_score

X_train = train_pdf[feature_cols].values
y_train = train_pdf["label"].values
X_test = test_pdf[feature_cols].values
y_test = test_pdf["label"].values

# Standardise features so Ridge penalty is meaningfully applied.
# On unscaled features with different numeric ranges, the L2 penalty can be
# dominated by larger-magnitude columns and make regParam effects less visible.
# spark.ml LinearRegression standardises by default; we match that behaviour.
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# SPARK-VIZ-STEP-5-BEGIN
# Change reg_param to study regularisation (Exercise 4)
# 0.0 = no regularisation | 0.1 = light L2 (Ridge) | 1.0 = strong L2 (Ridge)
# Equivalent to spark.ml LinearRegression(regParam=reg_param, elasticNetParam=0.0)
# Note: sklearn Ridge uses alpha = regParam * n_train (spark.ml normalises by 1/n)
reg_param = 0.0

if reg_param == 0.0:
    lr = LinearRegression()
else:
    lr = Ridge(alpha=reg_param * len(X_train_scaled))
lr.fit(X_train_scaled, y_train)
# SPARK-VIZ-STEP-5-END

# Coefficients in the STANDARDISED space — comparable across features
coefficients = lr.coef_.tolist()
intercept = float(lr.intercept_)

# Coefficients rescaled to ORIGINAL feature units — used for regression lines in
# FeatureScatter so the slope matches actual sales-per-$1k-spent interpretation.
coefficients_original_scale = (lr.coef_ / scaler.scale_).tolist()

# Training metrics
y_train_pred = lr.predict(X_train_scaled)
train_rmse = float(np.sqrt(mean_squared_error(y_train, y_train_pred)))
train_r2 = float(r2_score(y_train, y_train_pred))

# Test predictions & metrics
y_test_pred = lr.predict(X_test_scaled)

# SPARK-VIZ-STEP-6-BEGIN
test_rmse = float(np.sqrt(mean_squared_error(y_test, y_test_pred)))
# SPARK-VIZ-STEP-6-END

test_r2 = float(r2_score(y_test, y_test_pred))

# Prediction samples for visualisation
prediction_samples = []
for i in range(min(20, len(y_test))):
    prediction_samples.append({
        "features": X_test[i].tolist(),
        "label": float(y_test[i]),
        "prediction": float(y_test_pred[i]),
        "residual": float(y_test[i]) - float(y_test_pred[i])
    })

print(f"Train RMSE: {train_rmse:.4f}, R2: {train_r2:.4f}")
print(f"Test  RMSE: {test_rmse:.4f}, R2: {test_r2:.4f}")
coef_str = ", ".join(
    f"{name}={coefficients[i]:.4f}" for i, name in enumerate(feature_cols)
)
print(f"Coefficients: {coef_str}")
print(f"Intercept: {intercept:.4f}")

# CELL 7 — ML Pipeline: Document Classification (scikit-learn)
# Equivalent to spark.ml Pipeline(stages=[Tokenizer, HashingTF, LogisticRegression])
from sklearn.pipeline import Pipeline as SkPipeline
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression as SkLogisticRegression

# Training data — same as the lab's spark.createDataFrame example
pipeline_train_texts = [
    "a b c d e spark 6012",
    "b d",
    "spark f g h 6012",
    "hadoop mapreduce"
]
pipeline_train_labels = [1.0, 0.0, 1.0, 0.0]

# Build pipeline: tokenize+vectorize -> classify
# C=1/regParam; 1/0.001=1000 matches spark.ml LogisticRegression(regParam=0.001)
sk_pipeline = SkPipeline([
    ("vectorizer", CountVectorizer()),
    ("classifier", SkLogisticRegression(max_iter=100, C=1000.0))
])

sk_pipeline.fit(pipeline_train_texts, pipeline_train_labels)

# SPARK-VIZ-STEP-7-BEGIN
# Test documents — edit these to see how predictions change
pipeline_test_data = [
    {"id": 4, "text": "spark i j 6012"},
    {"id": 5, "text": "l m n"},
    {"id": 6, "text": "spark 6012 spark"},
    {"id": 7, "text": "apache hadoop"}
]
# SPARK-VIZ-STEP-7-END

pipeline_test_texts = [d["text"] for d in pipeline_test_data]
pipeline_preds = sk_pipeline.predict(pipeline_test_texts)
pipeline_probs = sk_pipeline.predict_proba(pipeline_test_texts)

pipeline_results = []
for i, d in enumerate(pipeline_test_data):
    pipeline_results.append({
        "id": d["id"],
        "text": d["text"],
        "probability": pipeline_probs[i].tolist(),
        "prediction": float(pipeline_preds[i])
    })

# Pipeline stage info for visualisation — maps to spark.ml concepts
pipeline_stages = [
    {
        "stage": 0,
        "name": "CountVectorizer",
        "type": "Transformer",
        "inputCol": "text",
        "outputCol": "features",
        "description": "Tokenises text and maps to bag-of-words feature vector (equivalent to Tokenizer + HashingTF)",
        "spark_equivalent": "Tokenizer + HashingTF"
    },
    {
        "stage": 1,
        "name": "LogisticRegression",
        "type": "Estimator -> Model",
        "inputCol": "features",
        "outputCol": "prediction",
        "description": "Binary classifier — fit() learns weights, predict() classifies new documents",
        "spark_equivalent": "LogisticRegression(maxIter=10, regParam=0.001)"
    }
]

# Show intermediate pipeline transformations for ALL test documents
vectorizer = sk_pipeline.named_steps["vectorizer"]
vocab = vectorizer.get_feature_names_out().tolist()

pipeline_traces = []
for d in pipeline_test_data:
    text = d["text"]
    words = text.lower().split()
    vec = vectorizer.transform([text])
    # Which vocabulary words are present in this document
    nonzero_indices = vec.nonzero()[1].tolist()
    matched_words = [vocab[idx] for idx in nonzero_indices if idx < len(vocab)]
    pipeline_traces.append({
        "id": d["id"],
        "input": text,
        "words": words,
        "features_size": vec.shape[1],
        "num_nonzero": int(vec.nnz),
        "matched_vocab": matched_words
    })

# Legacy single trace for backwards compat
pipeline_trace = [
    {"stage": "input", "text": pipeline_test_data[0]["text"]},
    {"stage": "tokenizer", "words": pipeline_test_data[0]["text"].lower().split()},
    {"stage": "vectorizer", "features_size": pipeline_traces[0]["features_size"],
     "num_nonzero": pipeline_traces[0]["num_nonzero"]}
]

# Pipeline training data as dicts for JSON
pipeline_training_data = [
    {"id": i, "text": pipeline_train_texts[i], "label": pipeline_train_labels[i]}
    for i in range(len(pipeline_train_texts))
]

print(f"\nPipeline predictions:")
for r in pipeline_results:
    print(f"  ({r['id']}, {r['text']}) -> prediction={r['prediction']}, prob={r['probability']}")

# CELL 9 — Build and emit JSON output
import json

# Serverless-safe config
try:
    shuffle_conf = spark.conf.get("spark.sql.shuffle.partitions")
    try:
        shuffle_partitions = int(shuffle_conf)
    except ValueError:
        shuffle_partitions = shuffle_conf
except Exception:
    shuffle_partitions = "auto"

try:
    adaptive_enabled = spark.conf.get("spark.sql.adaptive.enabled")
except Exception:
    adaptive_enabled = "True (Managed by Serverless)"

# helper
feature_select_expr = ", ".join(feature_cols)

# SPARK INTERNALS
# Frontend (Lab2ClusterView, Lab2Layout) reads this block
#
# partition_distribution = snapshot after CSV read (unified view, pre-split)
# train/test_partition_distribution = after randomSplit, per split
# transformation_pipeline = one entry per Step 1-7 with lazy/action flag and exact op text
spark_internals = {
    "partition_story": {
        "total_rows": total_rows,
        "num_partitions": csv_partition_count,
        "parallelism_ends_at": "Step 5 (.toPandas() collects all rows to the driver for scikit-learn)",
        "why_few_partitions": f"Advertising.csv is small ({total_rows} rows, ~4.5 KB) — Spark does not split small files; on a larger dataset the row count would spread across more partitions automatically.",
        "post_shuffle_partitions": csv_partition_count
    },
    "partition_distribution": partition_dist_after_read,
    "train_partition_distribution": train_partition_dist,
    "test_partition_distribution": test_partition_dist,
    "transformation_pipeline": [
        {
            "step": 1,
            "operation": "spark.range(N).selectExpr(rand() as x, rand() as y).filter(x*x+y*y<1).count()",
            "lazy": False, "spark_step": False,
            "partitions_before": None, "partitions_after": None,
            "output_rows": None,
            "description": "RDD concepts — parallelised collections, broadcast, accumulators, Monte Carlo pi. On HPC uses sc.parallelize(); on Serverless we use DataFrame spark.range() as the equivalent."
        },
        {
            "step": 2,
            "operation": "spark.read.csv(Advertising.csv).drop(_c0)",
            "lazy": True, "spark_step": True,
            "partitions_before": 0, "partitions_after": csv_partition_count,
            "output_rows": total_rows,
            "description": "Load Advertising CSV with schema inference. Narrow read — Spark splits the file into 1+ partitions depending on file size."
        },
        {
            "step": 3,
            "operation": f"df.select({feature_select_expr}, {label_col}.alias(label))",
            "lazy": True, "spark_step": True,
            "partitions_before": csv_partition_count, "partitions_after": csv_partition_count,
            "output_rows": total_rows,
            "description": "Narrow transformation — adds a projection to the DAG. On HPC, VectorAssembler would pack features into a dense vector."
        },
        {
            "step": 4,
            "lazy": True, "spark_step": True,
            "partitions_before": csv_partition_count, "partitions_after": csv_partition_count,
            "output_rows": train_count + test_count,
            "description": "Narrow transformation — each executor independently hash-assigns rows into train/test. No data moves across the network."
        },
        {
            "step": 5,
            "operation": "LinearRegression().fit(X_train_scaled, y_train)",
            "lazy": False, "spark_step": False,
            "partitions_before": csv_partition_count, "partitions_after": 1,
            "output_rows": train_count,
            "description": ".toPandas() collects all partitions to the driver. scikit-learn runs on the single-machine pandas DataFrame. Parallelism ends here."
        },
        {
            "step": 6,
            "operation": "mean_squared_error(y_test, y_test_pred)",
            "lazy": False, "spark_step": False,
            "partitions_before": 1, "partitions_after": 1,
            "output_rows": test_count,
            "description": "Predictions and evaluation on the driver. No Spark executors involved — ordinary single-machine Python."
        },
        {
            "step": 7,
            "operation": "Pipeline([CountVectorizer, LogisticRegression]).fit(texts)",
            "lazy": False, "spark_step": False,
            "partitions_before": 1, "partitions_after": 1,
            "output_rows": 4,
            "description": "ML Pipeline on the driver. On HPC spark.ml Pipeline distributes tokenisation and hashing; here scikit-learn runs equivalent stages locally."
        }
    ]
}

json_output = {
    "status": "success",
    "notebook": "Lab 2 - RDD, DataFrame, ML Pipeline",
    "spark_internals": spark_internals,

    "spark_config": {
        "spark_version": spark_version,
        "shuffle_partitions": shuffle_partitions,
        "adaptive_enabled": adaptive_enabled,
        "csv_partitions": csv_partition_count
    },

    "rdd_concepts": rdd_concepts,

    "dataframe": {
        "total_rows": total_rows,
        "schema": schema_fields,
        "raw_schema": raw_schema_fields,
        "describe": describe_rows,
        "sample_rows": sample_rows,
        "csv_partitions": csv_partition_count
    },

    "feature_engineering": {
        "feature_cols": feature_cols,
        "vector_length": len(feature_cols),
        "assembler_type": "Column selection + .toPandas() (Serverless Jobs API blocks spark.ml Py4J constructors)",
        "sample": features_sample,
        "all_rows": features_all,
        "note": "On HPC/classic Spark you would use VectorAssembler. On Serverless via Jobs API, Py4J blocks spark.ml constructors, so we select columns with DataFrame API and hand off to scikit-learn."
    },

    "train_test_split": {
        "split_ratio": split_ratio,
        "seed": split_seed,
        "train_count": train_count,
        "test_count": test_count,
        "total": train_count + test_count,
        "actual_train_pct": round(train_count / (train_count + test_count) * 100, 1),
        "actual_test_pct": round(test_count / (train_count + test_count) * 100, 1),
        "train_partition_dist": train_partition_dist,
        "test_partition_dist": test_partition_dist,
        "train_sample": train_sample,
        "test_sample": test_sample,
        "split_rows": split_rows,
        "note": "randomSplit is a narrow transformation — no shuffle. Each partition independently hashes rows into train/test buckets. .toPandas() then collects the small splits to the driver for scikit-learn."
    },

    "linear_regression": {
        "feature_cols": feature_cols,
        "coefficients": coefficients,
        "coefficients_original_scale": coefficients_original_scale,
        "coefficients_are_standardised": True,
        "reg_param": reg_param,
        "intercept": intercept,
        "coefficient_names": {feature_cols[i]: coefficients[i] for i in range(len(feature_cols))},
        "train_rmse": train_rmse,
        "train_r2": train_r2,
        "test_rmse": test_rmse,
        "test_r2": test_r2,
        "prediction_samples": prediction_samples,
        "ml_engine": "scikit-learn LinearRegression (scaled)" if reg_param == 0.0 else f"scikit-learn Ridge(alpha={reg_param * len(X_train_scaled):.1f}) — equiv. spark.ml regParam={reg_param}",
        "spark_equivalent": "pyspark.ml.regression.LinearRegression"
    },

    "regularisation_comparison": [],

    "ml_pipeline": {
        "stages": pipeline_stages,
        "trace": pipeline_trace,
        "traces": pipeline_traces,
        "training_data": pipeline_training_data,
        "test_data": [{"id": r["id"], "text": r["text"]} for r in pipeline_results],
        "predictions": pipeline_results,
        "ml_engine": "scikit-learn Pipeline (CountVectorizer + LogisticRegression)",
        "spark_equivalent": "pyspark.ml.Pipeline(stages=[Tokenizer, HashingTF, LogisticRegression])"
    },

    "pi_estimation": {
        "serverless_result": pi_estimate,
        "num_partitions": pi_partition_count,
        "num_samples": NUM_SAMPLES,
        "estimate": pi_estimate,
        "elapsed_ms": pi_elapsed_ms,
        "error": pi_error,
        "method": "DataFrame spark.range() + rand() — Serverless-safe replacement for sc.parallelize()"
    },

    "serverless_constraints": {
        "blocked": ["VectorAssembler", "LinearRegression", "LogisticRegression", "Pipeline", "Tokenizer", "HashingTF",
                    "RegressionEvaluator"],
        "reason": "Databricks Jobs API uses Spark Connect execution context with strict Py4J whitelist. Interactive notebooks use a compatibility shim that permits these constructors.",
        "workaround": "Spark handles data loading, schema inference, partitioning, and randomSplit. scikit-learn handles ML on the driver via .toPandas().",
        "pipeline_divergence": "scikit-learn CountVectorizer (bag-of-words) differs from spark.ml HashingTF (feature hashing into 262144-dim space). Predicted classes match but probabilities will differ numerically."
    }
}

dbutils.notebook.exit(json.dumps(json_output))
