import React, {useState, useEffect} from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import PartitionTimingChart from './PartitionTimingChart';
import './Lab1Layout.css';
import './Lab2Layout.css';
import CodePanel from './CodePanel';
import DataTable from './DataTable';
import DynamicVolumeBar from './DynamicVolumeBar';
import PartitionDiagram from './Partitiondiagram';
import StatsRow from './StatsRow';
import { useTour } from '../../context/TourContext';
import { lab1Steps, joyrideConfig } from '../../config/tourSteps';

function stepColour(step, stepIndex) {
    if (stepIndex === 1) return '#D55E00';
    if (step?.shuffle) return '#E69F00';
    if (step?.type === 'action' && !step?.shuffle) return '#0072B2';
    if (step?.partitions_after != null) return '#CC79A7';
    return '#56B4E9';
}

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
            `Data moves across the network from ${step.partitions ?? 1} -> ${step.partitions_after} partition(s), ` +
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

const ParallelTasksPanel = ({numPartitions, stepType, colour}) => {
    const n = Math.min(numPartitions ?? 8, 16);
    const label = stepType === 'repartition'
        ? 'tasks writing in parallel'
        : 'tasks executing filter in parallel';
    const detail = stepType === 'repartition'
        ? 'Each task writes its slice of rows to Delta Lake independently. No task waits for another.'
        : 'Each task scans its partition and counts local matches. Results are summed on the Driver — the only communication in the whole operation.';
    return (
        <div className="parallel-tasks" style={{color: colour, background: colour + '08'}}>
            <div className="parallel-tasks-header">
                Parallel Execution — {n} {label}
                {numPartitions > 16 && <span style={{fontWeight: 'normal'}}> (showing 16 of {numPartitions})</span>}
            </div>
            <div className="parallel-tasks-grid">
                {Array.from({length: n}, (_, i) => (
                    <div key={i} className="parallel-tasks-task" style={{background: colour + '18'}}>
                        Task {i}
                    </div>
                ))}
            </div>
            <p className="parallel-tasks-desc">{detail}</p>
        </div>
    );
};

const ExerciseAnswersPanel = ({data}) => {
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
        <div className="exercise-answers">
            <div className="exercise-answers-title">✓ Lab 1 Task 5 Exercise Answers</div>
            <p className="exercise-answers-subtitle">
                Computed by Spark on your cluster from the full <code>NASA_access_log_Aug95.gz</code>.
            </p>
            <table className="exercise-answers-table">
                <tbody>
                    {rows.map(({q, a}) => (
                        <tr key={q} className="exercise-answers-row">
                            <td className="exercise-answers-question">{q}</td>
                            <td className="exercise-answers-answer">{a}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const Lab1Layout = ({data, onExecuteStep, lastExecutedStep, runHistory = []}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [highlightedPartition, setHighlightedPartition] = useState(null);
    const { runTour, currentLabTour, startTour, endTour } = useTour();

    const { Tour } = useJoyride({
        steps: lab1Steps,
        run: runTour && currentLabTour === 'lab1',
        continuous: true,
        showProgress: true,
        showSkipButton: true,
        scrollOffset: 80,
        locale: joyrideConfig.locale,
        styles: joyrideConfig.styles,
        onEvent: (eventData) => {
            if ([STATUS.FINISHED, STATUS.SKIPPED].includes(eventData.status)) {
                endTour();
            }
        },
    });

    useEffect(() => {
        if (lastExecutedStep != null) {
            setCurrentStep(lastExecutedStep);
            setHighlightedPartition(null);
        }
    }, [data, lastExecutedStep]);

    // Auto-start tour on first visit
    useEffect(() => {
        const seen = localStorage.getItem('lab1_tour_seen') === 'true';
        if (!seen) {
            const timer = setTimeout(() => startTour('lab1'), 800);
            return () => clearTimeout(timer);
        }
    }, []);

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

    const handleSaveTrace = () => {
        const traceWithMeta = {...data, _lab: 'lab1'};
        const blob = new Blob([JSON.stringify(traceWithMeta, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spark-trace-lab1-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="layout-container">
            {Tour}
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

            <div className="code-panel">
                <CodePanel
                    currentStep={currentStep}
                    pipeline={pipeline}
                    onExecuteStep={onExecuteStep}
                    data={data}
                />
            </div>

            <div className="data-panel">
                <div className="data-panel-header">
                    <div className="panel-title">Data Panel</div>
                    <button
                        onClick={handleSaveTrace}
                        title="Download this run's execution trace as a JSON file"
                        className="trace-btn"
                    >
                        Save Trace
                    </button>
                </div>

                <div className="step-header">
                    <div className="step-header-top">
                        <h2 className="step-header-title">{activeStepData.operation}</h2>
                        <span className={`badge ${activeStepData.lazy ? 'badge--lazy' : 'badge--action'}`}>
                            {activeStepData.lazy ? 'LAZY' : 'ACTION'}
                        </span>
                        {activeStepData.shuffle && (
                            <span className="badge badge--shuffle">SHUFFLE</span>
                        )}
                    </div>
                    <p className="step-header-desc">{activeStepData.description}</p>
                </div>

                <DataTable
                    currentStep={currentStep}
                    data={data}
                    highlightedPartition={highlightedPartition}
                />

                {currentStep === 4 && data?.filter_results && (
                    <ExerciseAnswersPanel data={data} />
                )}

                {(currentStep === 2 || currentStep === 4) && (
                    <ParallelTasksPanel
                        numPartitions={numParts}
                        stepType={currentStep === 2 ? 'repartition' : 'action'}
                        colour={colour}
                    />
                )}

                <StatsRow currentStep={currentStep} data={data} />

                <div className="viz-card">
                    <div className="viz-card-header">
                        <span className="viz-card-title">Data Volume (Rows Processed)</span>
                    </div>
                    <div className="viz-card-body">
                        <DynamicVolumeBar pipelineData={pipeline} currentStep={currentStep} />
                    </div>
                </div>

                <PartitionDiagram
                    currentStep={currentStep}
                    data={data}
                    highlightedPartition={highlightedPartition}
                    onPartitionClick={handlePartitionClick}
                />

                {currentStep === 2 && runHistory.length > 0 && (
                    <div style={{marginTop: '8px'}}>
                        <PartitionTimingChart runHistory={runHistory} />
                    </div>
                )}
            </div>

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
