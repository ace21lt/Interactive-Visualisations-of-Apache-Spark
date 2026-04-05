import React, {useState, useEffect} from 'react';
import PartitionTimingChart from './PartitionTimingChart';
import './Lab1Layout.css';
import CodePanel from './CodePanel';
import DataTable from './DataTable';
import DynamicVolumeBar from './DynamicVolumeBar';
import PartitionDiagram from './Partitiondiagram';
import StatsRow from './StatsRow';

// ── Okabe-Ito colour helper (mirrors Partitiondiagram palette) ────────────────
function stepColour(step, stepIndex) {
    if (stepIndex === 1) return '#D55E00';
    if (step?.shuffle) return '#E69F00';
    if (step?.type === 'action' && !step?.shuffle) return '#0072B2';
    if (step?.partitions_after != null) return '#CC79A7';
    return '#56B4E9';
}

// ── Key concept text ──────────────────────────────────────────────────────────
function deriveKeyConcept(step, data) {
    if (!step) return '';
    const partCount = data?.spark_internals?.partition_distribution?.length
        ?? step.partitions ?? '?';

    if (step.type === 'action' && step.shuffle) {
        const readParts = step.partitions_read ?? '?';
        const outRows = step.output_rows ?? '?';
        return `WIDE transformation — ${step.operation} triggers a SHUFFLE. ` +
            `Each of the ${readParts} input partitions sends rows with matching keys to the same destination bucket. ` +
            `The groupBy produced only ${outRows} distinct keys — a tiny output. `;
    }

    if (step.type === 'action' && !step.shuffle) {
        return `ACTION — ${step.operation} triggers the full DAG. ` +
            `Every lazy transformation queued since the last action now executes across all ${partCount} partitions in parallel. ` +
            `Spark fires ${partCount} tasks simultaneously — one per partition — each evaluating the filter against its local rows with no inter-task communication. ` +
            `Only the final result (a single value) travels back to the Driver.`;
    }

    if (step.partitions_after != null) {
        return `WIDE transformation — repartition() triggers a full shuffle. ` +
            `Data moves across the network from ${step.partitions ?? 1} → ${step.partitions_after} partition(s), ` +
            `restoring the parallelism lost because gzip files are non-splittable. ` +
            `On non-Serverless Spark you would call .cache() here to keep the repartitioned data in memory. ` +
            `On Databricks Serverless, cache() is unavailable so the Delta write-and-reload achieves the same effect: ` +
            `it severs the DAG lineage so Spark reuses the balanced partitions without re-reading the full gzip.`;
    }

    if (step.lazy) {
        return `LAZY transformation — ${step.operation} adds a predicate to the logical plan (DAG) but executes nothing. ` +
            `Each partition will evaluate this operation independently when an action is called. ` +
            `No data moves across the network — Spark is building an instruction set, not running it yet.`;
    }

    return step.description ?? '';
}

// ── Parallel Tasks Panel ──────────────────────────────────────────────────────
// Shows N concurrent task boxes — makes parallelism concrete rather than
// just showing a partition count number.
// Shown on Step 2 (repartition write) and Step 4 (count() action).
const ParallelTasksPanel = ({numPartitions, stepType, colour}) => {
    const n = Math.min(numPartitions ?? 8, 16);
    const label = stepType === 'repartition'
        ? 'tasks writing in parallel'
        : 'tasks executing filter in parallel';
    const detail = stepType === 'repartition'
        ? 'Each task writes its slice of rows to Delta Lake independently. No task waits for another.'
        : 'Each task scans its partition and counts local matches. Results are summed on the Driver — the only communication in the whole operation.';
    return (
        <div style={{
            border: `1.5px solid ${colour}`,
            borderRadius: '6px',
            padding: '14px 16px',
            background: colour + '08'
        }}>
            <div style={{
                fontSize: '11px', fontWeight: 'bold', color: colour,
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px'
            }}>
                Parallel Execution — {n} {label}
                {numPartitions > 16 && <span style={{fontWeight: 'normal'}}> (showing 16 of {numPartitions})</span>}
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px'}}>
                {Array.from({length: n}, (_, i) => (
                    <div key={i} style={{
                        background: colour + '18',
                        border: `1px solid ${colour}`,
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: colour,
                        fontWeight: 'bold'
                    }}>
                        Task {i}
                    </div>
                ))}
            </div>
            <p style={{margin: 0, fontSize: '11px', color: 'var(--grey-600)', lineHeight: 1.6}}>
                {detail}
            </p>
        </div>
    );
};

// ── Exercise Answers Panel ────────────────────────────────────────────────────
// Collapsible panel on Step 4 — lets students verify their Task 5 answers
// against the actual numbers Spark computed on their cluster.
const ExerciseAnswersPanel = ({data}) => {
    const [open, setOpen] = useState(false);
    const fr = data?.filter_results ?? {};
    const rows = [
        {q: 'Q1 — Total requests in the log', a: (fr.total ?? 0).toLocaleString()},
        {q: 'Q2 — Requests from gateway.timken.com', a: (fr.from_timken ?? 0).toLocaleString()},
        {q: 'Q3 — Requests on 15 Aug 1995', a: (fr.on_15th ?? 0).toLocaleString()},
        {q: 'Q4 — Total 404 errors', a: (fr.errors_404 ?? 0).toLocaleString()},
        {q: 'Q5 — 404 errors on 15 Aug', a: (fr.errors_404_15th ?? 0).toLocaleString()},
        {q: 'Q6 — 404 errors from timken on 15 Aug', a: (fr.errors_404_15th_timken ?? 0).toLocaleString()},
    ];
    return (
        <div style={{border: '1px solid #ddd6fe', borderRadius: '6px', background: '#faf5ff', overflow: 'hidden'}}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', padding: '10px 16px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: '12px', fontWeight: 'bold', color: '#4c1d95'
                }}
            >
                <span>✓ Lab 1 Task 5 Exercise Answers — verify your solutions</span>
                <span style={{fontSize: '11px', fontWeight: 'normal', color: '#7c3aed'}}>
                    {open ? '▲ hide' : '▼ show'}
                </span>
            </button>
            {open && (
                <div style={{padding: '0 16px 12px'}}>
                    <p style={{margin: '0 0 8px', fontSize: '11px', color: '#6d28d9', lineHeight: 1.5}}>
                        Computed by Spark on your cluster from the full <code>NASA_access_log_Aug95.gz</code>.
                        Compare with your own Task 5 answers.
                    </p>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)'
                    }}>
                        <tbody>
                        {rows.map(({q, a}) => (
                            <tr key={q} style={{borderBottom: '1px solid #ede9fe'}}>
                                <td style={{padding: '6px 8px', color: '#5b21b6'}}>{q}</td>
                                <td style={{
                                    padding: '6px 8px',
                                    fontWeight: 'bold',
                                    color: '#1e1b4b',
                                    textAlign: 'right'
                                }}>{a}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ── Lab1Layout ────────────────────────────────────────────────────────────────
const Lab1Layout = ({data, onExecuteStep, lastExecutedStep, runHistory = []}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [highlightedPartition, setHighlightedPartition] = useState(null);
    // Navigate to the re-run step immediately after execution
    useEffect(() => {
        if (lastExecutedStep != null) {
            setCurrentStep(lastExecutedStep);
            setHighlightedPartition(null);
        }
    }, [data, lastExecutedStep]);

    const pipeline = data?.spark_internals?.transformation_pipeline ?? [];

    if (!pipeline.length) return <div style={{padding: 20}}>Loading Spark execution data…</div>;

    const activeStepData = pipeline[currentStep - 1];
    const keyConcept = deriveKeyConcept(activeStepData, data);
    const colour = stepColour(activeStepData, currentStep);
    const numParts = data?.spark_internals?.partition_distribution?.length
        ?? activeStepData?.partitions_after ?? 8;

    const handlePartitionClick = (pid) => {
        setHighlightedPartition(prev => prev === pid ? null : pid);
    };

    // Save trace — download the JSON that was just returned from Databricks.
    // Students can reload this later without re-running Spark (see Load Trace).
    const handleSaveTrace = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spark-trace-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="layout-container">

            {/* ── Stepper — keep exact original structure so step-btn flex:1 works ── */}
            <div className="header">
                {pipeline.map(stepData => (
                    <button
                        key={stepData.step}
                        className={`step-btn ${currentStep === stepData.step ? 'active' : ''}`}
                        onClick={() => {
                            setCurrentStep(stepData.step);
                            setHighlightedPartition(null);
                        }}
                    >
                        Step {stepData.step}
                    </button>
                ))}
            </div>

            {/* ── Code panel ── */}
            <div className="code-panel">
                <CodePanel
                    currentStep={currentStep}
                    pipeline={pipeline}
                    onExecuteStep={onExecuteStep}
                    data={data}
                />
            </div>

            {/* ── Data panel ── */}
            <div className="data-panel">

                {/* Trace row — Save only; Load Trace is in the top controls bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 0'
                }}>
                    <div className="panel-title" style={{margin: 0}}>Data Panel</div>
                    <button
                        onClick={handleSaveTrace}
                        title="Download this run's execution trace as a JSON file — reload it any time using the Load Trace button above without re-running Spark."
                        style={{
                            fontSize: '11px', padding: '4px 10px', borderRadius: '4px',
                            border: '1px solid var(--grey-300)', background: 'var(--grey-50)',
                            color: 'var(--grey-600)', cursor: 'pointer'
                        }}
                    >
                        ↓ Save Trace
                    </button>
                </div>

                {/* Step header */}
                <div style={{
                    border: '1px solid var(--grey-200)',
                    padding: '14px 16px',
                    borderRadius: '6px',
                    background: '#fff'
                }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px'}}>
                        <h2 style={{
                            margin: 0,
                            fontSize: '15px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--grey-900)'
                        }}>
                            {activeStepData.operation}
                        </h2>
                        <span style={{
                            fontSize: '11px', fontWeight: 'bold',
                            background: activeStepData.lazy ? '#f0e6ff' : '#e8f5e9',
                            color: activeStepData.lazy ? '#440099' : '#1b5e20',
                            padding: '3px 8px', borderRadius: '4px'
                        }}>
                            {activeStepData.lazy ? 'LAZY' : 'ACTION'}
                        </span>
                        {activeStepData.shuffle && (
                            <span style={{
                                fontSize: '11px', fontWeight: 'bold',
                                background: '#fce4ec', color: '#880e4f',
                                padding: '3px 8px', borderRadius: '4px'
                            }}>
                                SHUFFLE
                            </span>
                        )}
                    </div>
                    <p style={{margin: 0, fontSize: '13px', color: 'var(--grey-600)'}}>
                        {activeStepData.description}
                    </p>
                </div>

                {/* Data table with real cross-filtering */}
                <DataTable
                    currentStep={currentStep}
                    data={data}
                    highlightedPartition={highlightedPartition}
                />

                {/* Exercise answers — Step 4 only */}
                {currentStep === 4 && (
                    <ExerciseAnswersPanel data={data}/>
                )}

                {/* Parallel tasks visual — Steps 2 and 4 */}
                {(currentStep === 2 || currentStep === 4) && (
                    <ParallelTasksPanel
                        numPartitions={numParts}
                        stepType={currentStep === 2 ? 'repartition' : 'action'}
                        colour={colour}
                    />
                )}

                {/* Stats row — partition counts + shuffle info */}
                <StatsRow currentStep={currentStep} data={data}/>

                {/* Data volume bar — original div wrapper preserved */}
                <div style={{
                    border: '1px solid var(--grey-200)',
                    padding: '14px 16px',
                    background: '#fff',
                    borderRadius: '6px'
                }}>
                    <h3 style={{
                        marginTop: 0, marginBottom: '10px', fontSize: '13px',
                        fontWeight: 'bold', color: 'var(--grey-700)',
                        textTransform: 'uppercase', letterSpacing: '0.5px'
                    }}>
                        Data Volume (Rows Processed)
                    </h3>
                    <DynamicVolumeBar pipelineData={pipeline} currentStep={currentStep}/>
                </div>

                {/* Partition diagram — click to cross-filter */}
                <PartitionDiagram
                    currentStep={currentStep}
                    data={data}
                    highlightedPartition={highlightedPartition}
                    onPartitionClick={handlePartitionClick}
                />

                {/* Partition timing chart — Step 2 only, when run history exists */}
                {currentStep === 2 && runHistory.length > 0 && (
                    <div style={{marginTop: '8px'}}>
                        <PartitionTimingChart runHistory={runHistory}/>
                    </div>
                )}
            </div>

            {/* ── Key concept footer ── */}
            <div className="bottom-panel">
                <div className="concept-text">
                    <span className="concept-label">KEY CONCEPT —</span>
                    {keyConcept}
                </div>
            </div>

        </div>
    );
};

export default Lab1Layout;