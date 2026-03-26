import React, {useState, useEffect, useRef} from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {python} from '@codemirror/lang-python';
import {vscodeDark, vscodeLight} from '@uiw/codemirror-theme-vscode';
import {oneDark} from '@codemirror/theme-one-dark';
import './Lab1Layout.css';


// Step 1 — spark.read.text()         READ ONLY  (gzip non-splittability demo)
// Step 2 — NUM_PARTITIONS + delta    EDITABLE   (repartition config)
// Step 3 — hosts_japan = filter(.jp) EDITABLE   (lazy transformation)
// Step 4 — hosts_japan.count()       READ ONLY   (action that fires DAG)
// Step 5 — df = withColumn × 3       READ ONLY  (parsing — complex, don't break)
// Step 6 — repartitionByRange + groupBy(groupby_col)  EDITABLE

const codeTemplates = {
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
# optimised_path is pre-defined — only change NUM_PARTITIONS
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
# Nothing executes yet — Spark records the intention only.
hosts_japan = logs.filter(logs.value.contains(".jp"))`,
        readOnly: false,
        desc: "Change the filter string only — try '.uk', 'nasa.gov', or 'timken.com'. Keep the variable name 'hosts_japan' unchanged. Notice this step produces no output — the filter is lazy until an action is called in Step 4."
    },
    4: {
        title: "Count Action (Fires DAG)",
        defaultCode:
            `# Step 4 — Action: triggers the full DAG across all partitions
# read -> repartition -> filter all execute NOW in parallel.
hostsJapan_big = hosts_japan.count()`,
        readOnly: true,
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
# Change groupby_col to "day" or "host" and re-run to see how key
# cardinality changes the partition layout. Keep variable name 'status_counts'.
groupby_col = "status"
df_grouped = df.repartitionByRange(num_return_codes, groupby_col)
status_counts = df_grouped.groupBy(groupby_col).agg(count("*").alias("num")).orderBy(col("num").desc())`,
        readOnly: false,
        desc: "Change groupby_col to 'day' or 'host' and re-run. Each distinct value gets its own partition — watch the partition diagram update to show how many partitions appear for different key cardinalities. Keep the variable name 'status_counts' unchanged."
    }
};

const CodePanel = ({currentStep, onExecuteStep, data}) => {
    const activeTemplate = codeTemplates[currentStep];

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

    // Restore saved edit for this step, or fall back to defaultCode
    useEffect(() => {
        if (activeTemplate) {
            const saved = editsPerStep.current[currentStep];
            setEditorCode(saved !== undefined ? saved : activeTemplate.defaultCode);
            setRunError(null);
        }
    }, [currentStep]);

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
                    data?.spark_internals?.transformation_pipeline?.[currentStep - 1]?.description
                    ?? activeTemplate.desc
                }
                </p>
            </div>
        </div>
    );
};

export default CodePanel;