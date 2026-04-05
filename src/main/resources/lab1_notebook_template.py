# COM6012 - Lab 1: Introduction to (Py)Spark - Databricks Notebook (SERVERLESS)


# CELL 1 — File paths & Spark version (captured for JSON)
small_path = "/Volumes/main/default/sparkml_tmp/NASA_Aug95_100.txt"
big_path = "/Volumes/main/default/sparkml_tmp/NASA_access_log_Aug95.gz"

spark_version = spark.version
print(f"Spark version: {spark_version}")

# CELL 2 — Lab Task 3 (small file)
logFile_small = spark.read.text(small_path)
small_count = logFile_small.count()
first_row = logFile_small.first()

hostsJapan_small = logFile_small.filter(logFile_small.value.contains(".jp"))
hostsJapan_small.show(5, truncate=False)
hostsJapan_small_count = hostsJapan_small.count()

print(f"\nSmall file — total lines: {small_count}")
print(f"Small file — Japan hosts: {hostsJapan_small_count}")

# CELL 3 — Lab Task 4 (Big Data Read & Serverless-Safe Configs)
from pyspark.sql.functions import spark_partition_id

# SPARK-VIZ-STEP-1-BEGIN
logs_raw = spark.read.text(big_path)
# SPARK-VIZ-STEP-1-END

# Serverless-safe way to get partition count (no .rdd allowed)
gzip_partition_count = logs_raw.select(spark_partition_id()).distinct().count()
print(f"\ngzip read → partitions: {gzip_partition_count}  (non-splittable format)")

raw_sample = [row["value"] for row in logs_raw.limit(5).collect()]

# Serverless-safe Config Retrieval (handles "auto" and blocked configs)
try:
    shuffle_conf = spark.conf.get("spark.sql.shuffle.partitions")
    try:
        shuffle_partitions_configured = int(shuffle_conf)
    except ValueError:
        shuffle_partitions_configured = shuffle_conf  # Keeps the Serverless "auto" string
except Exception:
    shuffle_partitions_configured = "auto (Managed by Serverless)"

try:
    adaptive_enabled = spark.conf.get("spark.sql.adaptive.enabled")
except Exception:
    adaptive_enabled = "True (Forced & Managed by Serverless)"

print(f"spark.sql.shuffle.partitions: {shuffle_partitions_configured}")
print(f"spark.sql.adaptive.enabled: {adaptive_enabled}")

# CELL 4 — EXPLICIT REPARTITION & DELTA SAVE
# Replaces .cache() which is unsupported on Serverless. Severs the DAG lineage.

# optimised_path is defined outside the editable marker so student edits
# to NUM_PARTITIONS never accidentally lose the path definition.
optimised_path = "/Volumes/main/default/sparkml_tmp/NASA_logs_optimised"

# SKIP_REPARTITION is injected True by the backend when step 2 was not edited,
# saving ~40s by reusing the existing Delta table instead of rewriting it.
SKIP_REPARTITION = False

# SPARK-VIZ-STEP-2-BEGIN
NUM_PARTITIONS = 8

# Shuffle into NUM_PARTITIONS partitions and save (does the heavy lifting ONCE)
if not SKIP_REPARTITION:
    (logs_raw.repartition(NUM_PARTITIONS)
     .write.format("delta")
     .mode("overwrite")
     .save(optimised_path))
    print(f"Delta write complete: {NUM_PARTITIONS} partitions")
else:
    print(f"Skipping Delta write (SKIP_REPARTITION=True) — reusing existing table")

# Reload from the optimised Delta table and repartition to NUM_PARTITIONS.
# Delta read ignores the original repartition — we must apply it again.
logs = spark.read.format("delta").load(optimised_path).repartition(NUM_PARTITIONS)
# SPARK-VIZ-STEP-2-END


# Verify the data distribution across partitions (single job)
partition_dist_after_read = (
    logs
    .withColumn("pid", spark_partition_id())
    .groupBy("pid")
    .count()
    .orderBy("pid")
    .collect()
)
# Derive partition count from collected result — no extra Spark job needed
repartitioned_count = len(partition_dist_after_read)
print(f"\nAfter Delta reload → partitions: {repartitioned_count}")

# CELL 5 — Lab Task 4 core queries + Exercise answers

from pyspark.sql.functions import col, count, sum as spark_sum, when

_pat404 = r'"\s*404\b'
_stats = (
    logs.select(
        when(logs.value.contains("gateway.timken.com"), 1).otherwise(0).alias("t"),
        when(logs.value.contains("[15/Aug/1995"), 1).otherwise(0).alias("d"),
        when(logs.value.rlike(_pat404), 1).otherwise(0).alias("e"),
        when(logs.value.contains("[15/Aug/1995") & logs.value.rlike(_pat404), 1).otherwise(0).alias("ed"),
        when(logs.value.contains("gateway.timken.com")
             & logs.value.contains("[15/Aug/1995")
             & logs.value.rlike(_pat404), 1).otherwise(0).alias("edt"),
        # Folded in here to avoid a separate full scan action later
        when(logs.value.contains(".uk"), 1).otherwise(0).alias("uk"),
    )
    .agg(
        count("*").alias("total"),
        spark_sum("t").alias("from_timken"),
        spark_sum("d").alias("on_15th"),
        spark_sum("e").alias("errs_404"),
        spark_sum("ed").alias("errs_404_15"),
        spark_sum("edt").alias("errs_404_15_timken"),
        spark_sum("uk").alias("hosts_uk"),
    )
    .collect()[0]
)
total = _stats["total"]
from_timken = _stats["from_timken"]
on_15th = _stats["on_15th"]
errs_404 = _stats["errs_404"]
errs_404_15 = _stats["errs_404_15"]
errs_404_15_timken = _stats["errs_404_15_timken"]
hostsUK_big = _stats["hosts_uk"]

print(f"\nQ1 — Total requests: {total:,}")
print(f"Q2 — From gateway.timken.com: {from_timken:,}")
print(f"Q3 — On 15th August 1995: {on_15th:,}")
print(f"Q4 — Total 404 errors: {errs_404:,}")
print(f"Q5 — 404 errors on 15th Aug: {errs_404_15:,}")
print(f"Q6 — 404 from timken on 15th: {errs_404_15_timken:,}")

# CELL 6 — Lab 1 Optional / "Additional ideas" questions
from pyspark.sql.functions import regexp_extract, count, avg

# SPARK-VIZ-STEP-5-BEGIN
# Parse fields into a structured DataFrame (host, status, day)
df = (
    logs
    .withColumn("host", regexp_extract(col("value"), r"^(\S+)", 1))
    .withColumn("status", regexp_extract(col("value"), r'"\s+(\d{3})\s+', 1))
    .withColumn("day", regexp_extract(col("value"), r'\[(\d{2})/Aug/1995', 1))
    .select("host", "status", "day")
)

parsed_sample = [row.asDict() for row in df.limit(5).collect()]
# SPARK-VIZ-STEP-5-END

# hostsUK_big is now computed inside _stats (Cell 5) in the same pass as the
# exercise answers — no separate full scan needed here.

# INJECTED_FILTER_PREDICATE is replaced at runtime by the backend when the
# student edits step 3 — always reflects the actual predicate in hosts_japan.
INJECTED_FILTER_PREDICATE = '.jp'

# SPARK-VIZ-STEP-3-BEGIN
# Build the lazy filter DataFrame — no execution yet, predicate added to DAG only
hosts_japan = logs.filter(logs.value.contains(".jp"))
# SPARK-VIZ-STEP-3-END

filter_predicate = INJECTED_FILTER_PREDICATE

# SPARK-VIZ-STEP-4-BEGIN
# count() is an action — triggers the full DAG: read → repartition → filter
hostsJapan_big = hosts_japan.count()
# SPARK-VIZ-STEP-4-END

# Detect which action the student used — must happen BEFORE normalisation
# because normalisation overwrites the raw result with an int.
if isinstance(hostsJapan_big, int):
    _action_method = "count()"
    _action_result_desc = f"returned integer count: {hostsJapan_big}"
elif isinstance(hostsJapan_big, list):
    _action_method = f"take({len(hostsJapan_big)})"
    _action_result_desc = f"returned list of {len(hostsJapan_big)} Row(s)"
elif hostsJapan_big is not None:
    _action_method = "first()"
    _action_result_desc = "returned first matching Row"
else:
    _action_method = "first()"
    _action_result_desc = "returned None — no matching rows"

# Normalise hostsJapan_big to an integer regardless of which action the student used.
# Without this, .first() puts a Row object into the JSON and breaks all downstream
# arithmetic (NaN in filter counts, DV bar, partition sub-label, etc.).
if isinstance(hostsJapan_big, int):
    hostsJapan_big = hostsJapan_big        # .count()  → already an int
elif isinstance(hostsJapan_big, list):
    hostsJapan_big = len(hostsJapan_big)   # .take(n)  → list of Rows
elif hostsJapan_big is not None:
    hostsJapan_big = 1                     # .first()  → single Row means ≥1 match
else:
    hostsJapan_big = 0                     # .first()  on empty DF → None

# unique_hosts_15, unique_hosts_total, most_frequent_host removed —
# each requires an expensive shuffle on 75k distinct hosts and none
# are displayed in the visualisation panels.
unique_hosts_15 = 0
unique_hosts_total = 0
most_frequent_host_row = {"host": "n/a", "requests": 0}
num_return_codes = df.select("status").distinct().count()

# daily_counts is defined outside the editable marker — it is needed for
# metrics (num_days, avg_per_day) regardless of what the student groups by.
daily_counts = df.groupBy("day").agg(count("*").alias("requests"))
daily_counts_collected = daily_counts.collect()
num_days = len(daily_counts_collected)
avg_per_day = sum(r["requests"] for r in daily_counts_collected) / num_days if num_days else 0.0

# SPARK-VIZ-STEP-6-BEGIN
# repartitionByRange routes all rows with the same key to the same partition
# BEFORE the groupBy — each partition owns exactly one distinct value.
# Try changing "status" to "day" or "host" to see how key cardinality
# changes the partition layout. Keep the variable name 'status_counts'.
groupby_col = "status"
_key_counts = {"status": num_return_codes, "day": num_days}
num_groupby_keys = _key_counts.get(groupby_col, num_return_codes)
df_grouped = df.repartitionByRange(num_groupby_keys, groupby_col)
status_counts = df_grouped.groupBy(groupby_col).agg(count("*").alias("num")).orderBy(col("num").desc())
# SPARK-VIZ-STEP-6-END

# groupby_key is simply groupby_col — the variable the student set in the
# editable block above. When they change groupby_col = "day", this updates
# automatically throughout the JSON without any query plan parsing.
groupby_key = groupby_col

# status_sample collected outside marker so edits never lose it
status_sample = [row.asDict() for row in status_counts.collect()]

# avg_per_host removed — groupBy on 75k hosts is expensive and
# the metric is not displayed in the visualisation.
avg_per_host = 0.0

# CELL 7 — Capture Spark internals AFTER all actions have run
from pyspark.sql.functions import spark_partition_id as spid

#  1. Post-shuffle distribution — derived from status_sample (already collected).
# repartitionByRange creates one partition per distinct key, each owning all rows
# for that key. Any groupBy/count approach fires another shuffle whose output
# AQE coalesces to 1 partition, so we reconstruct the distribution in Python.
post_shuffle_dist = [
    {"pid": i, "count": row["num"]}
    for i, row in enumerate(status_sample)
]

# Derive from collected result — no extra Spark job
post_shuffle_partition_count = len(post_shuffle_dist)

print(f"\nPost-shuffle partition count ({groupby_key} groupBy): {post_shuffle_partition_count}")
for row in post_shuffle_dist:
    print(f"  Partition {row['pid']}: {row['count']} rows")

# 2. Serverless-safe shuffle partition config
try:
    val = spark.conf.get("spark.sql.shuffle.partitions")
    actual_shuffle_partitions = int(val) if str(val).isdigit() else str(val)
except Exception:
    actual_shuffle_partitions = "auto"

try:
    advisory_size_mb = int(spark.conf.get(
        "spark.sql.adaptive.advisoryPartitionSizeInBytes"
    )) // (1024 * 1024)
except Exception:
    advisory_size_mb = 64  # standard default; not directly readable on Serverless

# filter_partition_dist is now derived from raw_tracked_df below — no separate job needed.

# 4. Per-partition distribution AFTER groupBy('day')
# AQE on Serverless always coalesces 30 distinct day keys into 1 partition.
# Re-running the groupBy shuffle just to confirm this is wasteful — derive it
# directly from daily_counts_collected which is already in the driver.
daily_partition_dist = [{"pid": 0, "count": num_days}]
daily_post_shuffle_partition_count = 1

print(f"\nPost-shuffle partition count (day groupBy): {daily_post_shuffle_partition_count} (AQE-coalesced)")

# 5. Tracked rows — one row per partition in a SINGLE Spark job
# Also collect 5 rows per partition from df_grouped for step 6 partition panel.


from pyspark.sql.functions import spark_partition_id, first as spark_first

# Collect 5 rows per partition using collect_list — single Spark job, no sort.
# collect_list is cheap (no ordering required); we take the first 5 from each list.
# This avoids the expensive Window row_number + sort that was adding ~60s.
from pyspark.sql.functions import collect_list, slice as spark_slice
from collections import defaultdict

ROWS_PER_PARTITION = 5

# Output caps — prevent 30 MB limit when groupby_col = "host" (~75k distinct keys).
# Applied only at JSON serialisation time; counts/metrics use the full data.
MAX_DISTRIBUTION_ROWS = 200  # status_distribution / post_shuffle_distribution
MAX_GROUPED_PARTITIONS = 50  # grouped_tracked_rows partitions
MAX_RAW_VALUE_LEN = 150      # raw log line chars in tracked_rows

raw_tracked_df = (
    logs
    .withColumn("pid", spark_partition_id())
    .groupBy("pid")
    .agg(
        spark_slice(collect_list("value"), 1, ROWS_PER_PARTITION).alias("values"),
        # Counted in the same pass — avoids a separate hosts_japan full scan below
        spark_sum(when(col("value").contains(filter_predicate), 1).otherwise(0)).alias("filter_count"),
    )
    .orderBy("pid")
    .collect()
)

# Derive filter_partition_dist from the combined result — no extra Spark job
filter_partition_dist = [{"pid": r["pid"], "count": r["filter_count"]} for r in raw_tracked_df]

print(f"\nFilter partition distribution:")
for row in filter_partition_dist:
    print(f"  Partition {row['pid']}: {row['count']} matching rows")

# Build rows_by_partition from collect_list result
rows_by_partition = defaultdict(list)
for row in raw_tracked_df:
    for raw_value in row["values"]:
        host = raw_value.split(" ")[0]
        rows_by_partition[row["pid"]].append({
            "host": host,
            "raw_value": raw_value,
            "passes_japan_filter": False  # filled in below after filter set is built
        })

# Check passes_japan_filter by testing raw_value directly — exactly what Spark does.

for pid, rows in rows_by_partition.items():
    for row in rows:
        row["passes_japan_filter"] = filter_predicate in row["raw_value"]

# tracked_partitions: one entry per partition with a 'rows' list
tracked_partitions = [
    {
        "partition_id": pid,
        "rows": rows_by_partition[pid]
    }
    for pid in sorted(rows_by_partition.keys())
]

# Extract status and day directly from raw_value using Python regex.

import re as _field_re

for tp in tracked_partitions:
    for row in tp["rows"]:
        _rv = row["raw_value"]
        _sm = _field_re.search(r'"\s+(\d{3})\s+', _rv)
        _dm = _field_re.search(r'\[(\d{2})/Aug/1995', _rv)
        row["status"] = _sm.group(1) if _sm else ""
        row["day"] = _dm.group(1) if _dm else ""

# Legacy field — keep a flat list of parsed rows for backwards compatibility
tracked_parsed_rows = [
    {"host": row["host"], "status": row["status"],
     "day": row["day"], "partition_id": tp["partition_id"]}
    for tp in tracked_partitions
    for row in tp["rows"]
]

all_tracked_partitions = tracked_partitions

# Collect 5 sample rows per distinct key value directly from df — single Spark job.
# Grouping by key value (not Spark partition ID) guarantees that pid i here always
# matches pid i in post_shuffle_dist, both of which enumerate status_sample in
# count-descending order. This avoids any repartitionByRange pid ordering ambiguity.
from pyspark.sql.functions import struct

_top_keys = {row[groupby_key] for row in status_sample[:MAX_GROUPED_PARTITIONS]}
df_key_tracked = (
    df
    .filter(col(groupby_key).isin(_top_keys))
    .groupBy(groupby_key)
    .agg(spark_slice(collect_list(struct("host", "status", "day")), 1, ROWS_PER_PARTITION).alias("rows"))
    .collect()
)

_key_to_pid = {row[groupby_key]: i for i, row in enumerate(status_sample)}
grouped_rows_by_partition = {}
for _grow in df_key_tracked:
    _key_val = _grow[groupby_key]
    _pid = _key_to_pid.get(_key_val)
    if _pid is not None:
        grouped_rows_by_partition[_pid] = [
            {"host": r["host"], "status": r["status"], "day": r["day"]}
            for r in _grow["rows"]
        ]

print("\nTracked rows through pipeline:")
for tp in all_tracked_partitions:
    for r in tp["rows"]:
        print(f"  Partition {tp['partition_id']} → {r['host']} | passes filter: {r['passes_japan_filter']}")

# CELL 8 — Build and emit the JSON output
import json

json_output = {
    "status": "success",
    "notebook": "Lab 1 - NASA Logs",

    "spark_config": {
        "spark_version": spark_version,
        "shuffle_partitions": actual_shuffle_partitions,
        "adaptive_enabled": adaptive_enabled,
        "filter_predicate": filter_predicate,
        "groupby_key": groupby_key,
        "num_partitions": NUM_PARTITIONS,
        "skip_repartition": SKIP_REPARTITION,
        "note_gzip": "gzip files are non-splittable: Spark reads the entire file in 1 partition. repartition() is required to restore parallelism."
    },

    "small_file": {
        "total_lines": small_count,
        "japan_hosts": hostsJapan_small_count,
        "first_row": first_row["value"]
    },

    "metrics": {
        "unique_hosts_15": unique_hosts_15,
        "unique_hosts_total": unique_hosts_total,
        "num_return_codes": num_return_codes,
        "num_days": num_days,
        "avg_per_day": float(avg_per_day),
        "avg_per_host": float(avg_per_host)
    },

    "filter_results": {
        "total": total,
        "hosts_japan": hostsJapan_big,
        "hosts_uk": hostsUK_big,
        "from_timken": from_timken,
        "on_15th": on_15th,
        "errors_404": errs_404,
        "errors_404_15th": errs_404_15,
        "errors_404_15th_timken": errs_404_15_timken
    },

    "status_distribution": [
        {"key": row[groupby_key], "count": row["num"]}
        for row in status_sample[:MAX_DISTRIBUTION_ROWS]
    ],

    "top_host": {
        "host": most_frequent_host_row["host"],
        "requests": most_frequent_host_row["requests"]
    },

    "sample_rows": {
        "raw_log": raw_sample,
        "parsed_df": parsed_sample
    },

    "daily_counts": [
        {"day": row["day"], "requests": row["requests"]}
        for row in daily_counts_collected
    ],

    "tracked_rows": [
        {
            "partition_id": tp["partition_id"],
            "rows": [
                {
                    "host": r["host"],
                    "raw_value": r["raw_value"][:MAX_RAW_VALUE_LEN],
                    "status": r["status"],
                    "day": r["day"],
                    "passes_japan_filter": r["passes_japan_filter"]
                }
                for r in tp["rows"]
            ]
        }
        for tp in all_tracked_partitions
    ],

    "grouped_tracked_rows": [
        {
            "partition_id": pid,
            "rows": rows
        }
        for pid, rows in sorted(grouped_rows_by_partition.items())[:MAX_GROUPED_PARTITIONS]
    ],

    # Parsed state of tracked rows (after withColumn transformations)
    "tracked_rows_parsed": tracked_parsed_rows,

    "spark_internals": {

        "partition_story": {
            "gzip_read_partitions": gzip_partition_count,
            "after_repartition": repartitioned_count,
            "configured_shuffle_partitions": actual_shuffle_partitions,
            "post_shuffle_partitions": post_shuffle_partition_count,
            "daily_post_shuffle_partitions": daily_post_shuffle_partition_count,
            "why_gzip_is_one": "gzip uses DEFLATE compression which is not seekable. Spark cannot split the stream, so 1 task handles all data."
        },

        "partition_distribution": [
            {"partition_id": row["pid"], "row_count": row["count"]}
            for row in partition_dist_after_read
        ],

        "filter_partition_distribution": [
            {"partition_id": row["pid"], "row_count": row["count"]}
            for row in filter_partition_dist
        ],

        "post_shuffle_distribution": [
            {"partition_id": row["pid"], "row_count": row["count"]}
            for row in post_shuffle_dist[:MAX_DISTRIBUTION_ROWS]
        ],

        "daily_partition_distribution": [
            {"partition_id": row["pid"], "row_count": row["count"]}
            for row in daily_partition_dist
        ],

        "transformation_pipeline": [
            {
                "step": 1,
                "operation": "spark.read.text(big_path)",
                "code_snippet": "logs_raw = spark.read.text(big_path)",
                "type": "transformation",
                "lazy": True,
                "output_rows": total,
                "partitions": gzip_partition_count,
                "description": "Load NASA HTTP log file (gzip — non-splittable)"
            },
            {
                "step": 2,
                "operation": f"logs.repartition({NUM_PARTITIONS})",
                "code_snippet": f"(logs_raw.repartition({NUM_PARTITIONS})\n .write.format('delta')\n .mode('overwrite')\n .save(optimised_path))\n\nlogs = spark.read.format('delta').load(optimised_path)",
                "type": "transformation",
                "lazy": True,
                "partitions_before": gzip_partition_count,
                "partitions_after": repartitioned_count,
                "output_rows": total,
                "description": "Repartition to enable parallel processing."
            },
            {
                "step": 3,
                "operation": f"logs.filter(contains('{filter_predicate}'))",
                "code_snippet": f"hosts_japan = logs.filter(logs.value.contains('{filter_predicate}'))",
                "type": "transformation",
                "lazy": True,
                "output_rows": None,
                "partitions": repartitioned_count,
                "description": f"Filter for '{filter_predicate}' — adds predicate to DAG only (lazy)."
            },
            {
                "step": 4,
                "operation": f"hosts_japan.{_action_method}",
                "code_snippet": f"hostsJapan_big = hosts_japan.{_action_method}",
                "type": "action",
                "lazy": False,
                "output_rows": hostsJapan_big,
                "partitions": repartitioned_count,
                "description": f"{_action_method} triggers execution, '{filter_predicate}' filter fires across {repartitioned_count} partitions in parallel. Action {_action_result_desc}."
            },
            {
                "step": 5,
                "operation": "withColumn(regexp_extract) × 3",
                "code_snippet": "df = (\n    logs\n    .withColumn('host',   regexp_extract(col('value'), r'^(\\S+)', 1))\n    .withColumn('status', regexp_extract(col('value'), r'\"\\s+(\\d{3})\\s+', 1))\n    .withColumn('day',    regexp_extract(col('value'), r'\\[(\\d{2})/Aug/1995', 1))\n    .select('host', 'status', 'day')\n)",
                "type": "transformation",
                "lazy": True,
                "output_rows": total,
                "partitions": repartitioned_count,
                "description": "Parse log fields: host, status, day"
            },
            {
                "step": 6,
                "operation": f"df.repartitionByRange().groupBy('{groupby_key}')",
                "code_snippet": f"df_grouped = df.repartitionByRange(num_groupby_keys, '{groupby_key}')\nstatus_counts = df_grouped.groupBy('{groupby_key}').agg(count('*').alias('num'))",
                "type": "action",
                "lazy": False,
                "shuffle": True,
                "output_rows": len(status_sample),
                "partitions_read": repartitioned_count,
                "partitions_write": actual_shuffle_partitions,
                "description": f"repartitionByRange routes all '{groupby_key}' rows to the same partition — {len(status_sample)} distinct keys -> {len(status_sample)} partitions."
            }
        ],

        "shuffles": [
            {
                "operation": f"groupBy('{groupby_key}')",
                "triggered_by": "count()",
                "reason": f"repartitionByRange pre-partitions by '{groupby_key}' — each partition owns one distinct value before groupBy fires",
                "partitions_read": repartitioned_count,
                "partitions_write": actual_shuffle_partitions,
                "post_shuffle_count": post_shuffle_partition_count,
                "output_distinct_keys": len(status_sample),
                "advisory_size_mb": advisory_size_mb,
                "aqe_coalesced": (actual_shuffle_partitions > post_shuffle_partition_count)
                if isinstance(actual_shuffle_partitions, int)
                else "Managed dynamically by Serverless AQE"
            },
            {
                "operation": "groupBy('day')",
                "triggered_by": "count()",
                "reason": "Aggregation requires all rows with same day on same partition",
                "partitions_read": repartitioned_count,
                "partitions_write": actual_shuffle_partitions,
                "post_shuffle_count": daily_post_shuffle_partition_count,
                "output_distinct_keys": num_days,
                "advisory_size_mb": advisory_size_mb,
                "aqe_coalesced": (actual_shuffle_partitions > daily_post_shuffle_partition_count)
                if isinstance(actual_shuffle_partitions, int)
                else "Managed dynamically by Serverless AQE"
            }
        ],

        "stages": [
            {
                "stage_id": 1,
                "name": "Read → Repartition",
                "operations": ["read", "repartition"],
                "shuffle": True,
                "rows_processed": total,
                "rows_output": total
            },
            {
                "stage_id": 2,
                "name": "Filter → Parse Fields",
                "operations": ["filter", "withColumn", "regexp_extract"],
                "shuffle": False,
                "rows_processed": total,
                "rows_output": total
            },
            {
                "stage_id": 3,
                "name": f"Aggregate by {groupby_key}",
                "operations": ["groupBy", "count"],
                "shuffle": True,
                "rows_processed": total,
                "rows_output": len(status_sample)
            },
            {
                "stage_id": 4,
                "name": "Aggregate by Day",
                "operations": ["groupBy", "count"],
                "shuffle": True,
                "rows_processed": total,
                "rows_output": num_days
            }
        ]
    }
}

dbutils.notebook.exit(json.dumps(json_output))