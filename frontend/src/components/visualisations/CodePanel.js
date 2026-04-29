import React, {useState, useEffect, useRef} from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {python} from '@codemirror/lang-python';
import {vscodeDark, vscodeLight} from '@uiw/codemirror-theme-vscode';
import {oneDark} from '@codemirror/theme-one-dark';
import './Lab1Layout.css';



const lab1CodeTemplates = {
    1: {
        title: "Load NASA Log File",
        defaultCode:
            `# Step 1 — Load the raw .gz file
# gzip is non-splittable: Spark reads the entire file in 1 partition.
# repartition() in Step 2 is required to restore parallelism.
logs_raw = spark.read.text(big_path)`,
        readOnly: true,
        desc: "gzip compression forces Spark to use a single partition. Watch the partition count — it will be 1 here, then jump to NUM_PARTITIONS after Step 2."
    },
    2: {
        title: "Repartition & Delta Save",
        defaultCode:
            `# Step 2 — Repartition to enable parallel processing
# only change NUM_PARTITIONS
NUM_PARTITIONS = 8

(logs_raw.repartition(NUM_PARTITIONS)
 .write.format("delta")
 .mode("overwrite")
 .save(optimised_path))

# Delta read ignores the original repartition — apply it again
logs = spark.read.format("delta").load(optimised_path).repartition(NUM_PARTITIONS)`,
        readOnly: false,
        desc: "Change NUM_PARTITIONS (try 4, 16, 32). How does partition count affect execution time and data distribution across partitions?"
    },
    3: {
        title: "Filter by Domain (Lazy)",
        defaultCode:
            `# Step 3 — Narrow Transformation: add a filter predicate to the DAG
hosts_japan = logs.filter(logs.value.contains(".jp"))`,
        readOnly: false,
        desc: "Change the filter string only — try '.uk', '.gov', or '.dk'. Keep the variable name 'hosts_japan' unchanged. Notice this step produces no output — the filter is lazy until an action is called in Step 4."
    },
    4: {
        title: "Count Action (Fires DAG)",
        defaultCode:
            `# Step 4 — Action: triggers the full DAG across all partitions
# read -> repartition -> filter all execute NOW in parallel.
hostsJapan_big = hosts_japan.count()`,
        readOnly: false,
        desc: "count() is an action — it forces Spark to execute the entire DAG built in Steps 1–3. Keep the variable name 'hostsJapan_big' unchanged. Try changing .count() to .first() or .take(5) to see different action types."
    },
    5: {
        title: "Parse Log Fields (Narrow)",
        defaultCode:
            `# Step 5 — Parse structured fields from raw log lines
df = (
    logs
    .withColumn("host",   regexp_extract(col("value"), r"^(\\S+)", 1))
    .withColumn("status", regexp_extract(col("value"), r'"\\s+(\\d{3})\\s+', 1))
    .withColumn("day",    regexp_extract(col("value"), r'\\[(\\d{2})/Aug/1995', 1))
    .select("host", "status", "day")
)`,
        readOnly: true,
        desc: "Three withColumn() calls add new columns using regexp_extract. This is a narrow transformation — each partition processes its own rows independently, no shuffle needed."
    },
    6: {
        title: "Group by Key (Wide Transformation)",
        defaultCode:
            `# Step 6 — repartitionByRange routes all rows with the same key to the
# SAME partition before groupBy, so each partition owns one distinct value.
groupby_col = "status"
df_grouped = df.repartitionByRange(num_return_codes, groupby_col)
status_counts = df_grouped.groupBy(groupby_col).agg(count("*").alias("num")).orderBy(col("num").desc())`,
        readOnly: false,
        desc: "Change groupby_col to 'day' or 'host' and re-run. Each distinct value gets its own partition — watch the partition diagram update to show how many partitions appear for different key cardinalities. Keep the variable name 'status_counts' unchanged."
    }
};

const lab2CodeTemplates = {
    1: {
        title: "Pi Estimation — vary partitions & samples",
        defaultCode:
            `# Lab Section 5 (optional): vary the two values below to study
# time cost and precision. Each run is recorded in the history panel.
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
pi_error = abs(pi_estimate - _math.pi)`,
        readOnly: false,
        desc: "Lab Section 5 (optional). Try NUM_PARTITIONS = 2, 4, 8, 16. Try NUM_SAMPLES = 100_000 up to 10_000_000. The history panel records every combination."
    },
    2: {
        title: "Load Advertising CSV",
        defaultCode:
            `# Step 2 — Load CSV with schema inference
df_raw = spark.read.load(csv_path, format="csv", inferSchema="true", header="true")
df = df_raw.drop("_c0")  # Remove the unnamed index column`,
        readOnly: true,
        desc: "Spark infers the schema from the CSV header and data types. The unnamed first column (_c0) is the original row index so we drop it. Notice the column types: all features are DoubleType."
    },
    3: {
        title: "Feature Column Selection (VectorAssembler)",
        defaultCode:
            `# Step 3 — Select feature columns used for the regression model
feature_cols = ["TV", "radio", "newspaper"]
label_col = "sales"
df_selected = df.select(*feature_cols, col(label_col).alias("label"))`,
        readOnly: false,
        desc: "VectorAssembler packs feature columns into a single dense vector for spark.ml. On HPC this produces a features column of type Vector. On Serverless via Jobs API, spark.ml constructors are blocked so we select columns and convert to pandas. Try removing 'newspaper' from feature_cols to see its effect on predictions."
    },
    4: {
        title: "Train/Test Split",
        defaultCode:
            `# Step 4 — Split data for training and evaluation
split_ratio = [0.6, 0.4]
split_seed = 6012
(trainingData, testData) = df_selected.randomSplit(split_ratio, split_seed)`,
        readOnly: false,
        desc: "randomSplit is a narrow transformation meaning there is no shuffle. Each partition independently hashes rows into buckets. Try [0.8, 0.2] or change the seed."
    },
    5: {
        title: "Linear Regression — Fit",
        defaultCode:
            `# Change reg_param to study regularisation (Exercise 4)
# 0.0 = no regularisation | 0.1 = light L2 (Ridge) | 1.0 = strong L2 (Ridge)
# Equivalent to spark.ml LinearRegression(regParam=reg_param, elasticNetParam=0.0)
# Note: sklearn Ridge uses alpha = regParam * n_train (spark.ml normalises by 1/n)
reg_param = 0.0

if reg_param == 0.0:
    lr = LinearRegression()
else:
    lr = Ridge(alpha=reg_param * len(X_train_scaled))
lr.fit(X_train_scaled, y_train)`,
        readOnly: false,
        desc: "Change reg_param (try 0.1, 1.0) and click Run. Watch the coefficient chart update, TV and radio shrink under Ridge regularisation. Newspaper may grow as it shares variance with radio and absorbs what radio releases. Equivalent to spark.ml LinearRegression(regParam=reg_param, elasticNetParam=0.0)"
    },
    6: {
        title: "Prediction & Evaluation",
        defaultCode:
            `# Step 6 — Evaluate on test data
test_rmse = float(np.sqrt(mean_squared_error(y_test, y_test_pred)))`,
        readOnly: true,
        desc: "RMSE measures average prediction error. Points close to the diagonal line are well-predicted. Vertical distance from the line is the residual."
    },
    7: {
        title: "ML Pipeline — Exercise 5",
        defaultCode:
            `# Exercise 5 — construct a new test dataset with three samples
# On HPC: spark.createDataFrame([(8,"pyspark hadoop"),(9,"spark a b c"),(10,"mapreduce spark")], ["id","text"])
# Here we use the dict format; the scikit-learn pipeline runs on the driver.
# 'spark' is a positive signal; 'hadoop' and 'mapreduce' are negative.
# 'pyspark' is unknown — not in the training vocabulary.
pipeline_test_data = [
    {"id": 8, "text": "pyspark hadoop"},
    {"id": 9, "text": "spark a b c"},
    {"id": 10, "text": "mapreduce spark"}
]`,
        readOnly: false,
        desc: "Exercise 5: run this and report the prediction probabilities and predicted labels for all three documents. Before clicking Run, check the training data on tab 7a and predict each label yourself (1 = Spark-related, 0 = not). Then click Run and compare."
    }
};

const templatesByLab = {
    lab1: lab1CodeTemplates,
    lab2: lab2CodeTemplates,
};

function detectLab(data, currentStep) {
    if (data?._lab && templatesByLab[data._lab]) return data._lab;
    if (data?.ml_pipeline || data?.linear_regression || data?.feature_engineering || data?.rdd_concepts) {
        return 'lab2';
    }
    return currentStep > Object.keys(lab1CodeTemplates).length ? 'lab2' : 'lab1';
}

const CodePanel = ({currentStep, onExecuteStep, data}) => {
    const templates = templatesByLab[detectLab(data, currentStep)] ?? lab1CodeTemplates;
    const activeTemplate = templates[currentStep];
    const [editorCode, setEditorCode] = useState("");
    const [isExecuting, setIsExecuting] = useState(false);
    const [runError, setRunError] = useState(null);
    const [editorTheme, setEditorTheme] = useState('dark');

    // Preserve edited code per step across navigation
    const editsPerStep = useRef({});

    const themes = {
        dark: {cm: vscodeDark, label: 'Dark', bg: '#1e1e1e'},
        light: {cm: vscodeLight, label: 'Light', bg: '#ffffff'},
        oneDark: {cm: oneDark, label: 'One Dark', bg: '#282c34'},
    };
    const activeTheme = themes[editorTheme] ?? themes.dark;

    // Restore saved edit for this step, otherwise use the hardcoded step template
    useEffect(() => {
        if (activeTemplate) {
            const saved = editsPerStep.current[currentStep];
            setEditorCode(saved !== undefined ? saved : (activeTemplate.defaultCode ?? ""));
            setRunError(null);
        }
    }, [currentStep, activeTemplate]);

    const handleRun = async () => {
        if (!onExecuteStep) return;
        setIsExecuting(true);
        setRunError(null);
        try {
            await onExecuteStep({step: currentStep, editedCode: editorCode});
        } catch (err) {
            setRunError(err?.message ?? "Run failed");
        } finally {
            setIsExecuting(false);
        }
    };

    if (!activeTemplate) return null;

    return (
        <div className="code-panel"
             style={{display: 'flex', flexDirection: 'column', height: '100%', borderRight: 'none', padding: 0}}>
            <div className="panel-title" style={{marginBottom: '16px'}}>Interactive Editor</div>

            {/* Code editor */}
            <div style={{
                background: activeTheme.bg,
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                overflow: 'hidden'
            }}>
                {/* Editor header */}
                <div style={{
                    background: '#2d2d2d',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid #444'
                }}>
                    <span style={{color: '#888', fontSize: '12px', fontFamily: 'var(--font-mono)'}}>
                        Step_{currentStep}_{activeTemplate.title.replace(/\s+/g, '_')}.py
                    </span>
                </div>

                {/* CodeMirror */}
                <div style={{flex: 1, overflowY: 'auto'}}>
                    <CodeMirror
                        value={editorCode}
                        height="100%"
                        theme={activeTheme.cm}
                        extensions={[python()]}
                        onChange={(value) => {
                            setEditorCode(value);
                            editsPerStep.current[currentStep] = value;
                        }}
                        editable={!activeTemplate.readOnly}
                        basicSetup={{
                            lineNumbers: true,
                            highlightActiveLine: true,
                            bracketMatching: true,
                        }}
                        style={{fontSize: '14px', fontFamily: 'var(--font-mono)'}}
                    />
                </div>

                {/* Action bar */}
                <div style={{
                    padding: '12px 20px',
                    background: '#252526',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span style={{color: '#888', fontSize: '12px'}}>
                        {activeTemplate.readOnly ? 'Read Only' : 'Editable PySpark'}
                    </span>

                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                        {/* Accessibility: cycle editor colour theme */}
                        <button
                            onClick={() => {
                                const keys = Object.keys(themes);
                                const next = keys[(keys.indexOf(editorTheme) + 1) % keys.length];
                                setEditorTheme(next);
                            }}
                            title={`Theme: ${activeTheme.label} — click to cycle`}
                            aria-label="Cycle editor colour theme"
                            style={{
                                background: '#3c3c3c',
                                color: '#ccc',
                                border: '1px solid #555',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {activeTheme.label}
                        </button>

                        {!activeTemplate.readOnly && (
                            <button
                                onClick={handleRun}
                                disabled={isExecuting}
                                style={{
                                    background: 'var(--uos-purple)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 16px',
                                    borderRadius: '4px',
                                    cursor: isExecuting ? 'wait' : 'pointer',
                                    fontWeight: 'bold',
                                    opacity: isExecuting ? 0.7 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {isExecuting ? 'Running on Databricks…' : '▶ Run Code'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Error display */}
            {runError && (
                <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    background: '#fff0f0',
                    borderLeft: '4px solid #cc0000',
                    borderRadius: '4px',
                    fontSize: '13px',
                    color: '#cc0000'
                }}>
                    <strong>Error:</strong> {runError}
                </div>
            )}

            {/* Step instructions */}
            <div style={{
                marginTop: '16px',
                padding: '12px',
                background: '#f4f4f4',
                borderLeft: '4px solid var(--uos-yellow)',
                borderRadius: '4px',
                fontSize: '13px'
            }}>
                <p style={{margin: 0, color: '#333'}}>
                    <strong>Task:</strong> {
                    activeTemplate.desc
                }
                </p>
            </div>
        </div>
    );
};

export default CodePanel;