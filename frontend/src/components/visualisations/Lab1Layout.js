import React, {useState, useEffect} from 'react';
import PartitionTimingChart from './PartitionTimingChart';
import './Lab1Layout.css';
import CodePanel from './CodePanel';
import DataTable from './DataTable';
import DynamicVolumeBar from './DynamicVolumeBar';
import PartitionDiagram from './Partitiondiagram';
import StatsRow from './StatsRow';

// Derive key concept from pipeline step
// Reads type/lazy/shuffle flags and operation label from the JSON step object.
function deriveKeyConcept(step) {
    if (!step) return '';

    // Action + shuffle: groupBy/join
    if (step.type === 'action' && step.shuffle) {
        const write = step.partitions_write ?? '?';
        const readParts = step.partitions_read ?? '?';
        const outRows = step.output_rows ?? '?';
        return `WIDE transformation — ${step.operation} triggers a SHUFFLE. ` +
            `Each of the ${readParts} input partitions sends rows with matching keys to the same destination bucket. ` +
            `The groupBy produced only ${outRows} distinct keys — a tiny output. `;
    }

    // Action, no shuffle: count() / collect()
    if (step.type === 'action' && !step.shuffle) {
        return `ACTION — ${step.operation} triggers the full DAG. ` +
            `Every lazy transformation queued since the last action now executes across all partitions in parallel. ` +
            `Only the final result travels back to the Driver.`;
    }

    // Repartition: partitions_after is set and differs from partitions
    if (step.partitions_after != null) {
        return `WIDE transformation — repartition() triggers a full shuffle. ` +
            `Data moves across the network from ${step.partitions ?? 1} → ${step.partitions_after} partition(s). ` +
            `This is necessary because gzip files are non-splittable and load into a single partition.`;
    }

    // Lazy narrow transformation
    if (step.lazy) {
        return `LAZY transformation — ${step.operation} adds a predicate to the logical plan (DAG) but executes nothing. ` +
            `Each partition will evaluate this operation independently when an action is called. ` +
            `No data moves across the network.`;
    }

    // Fallback: use description from JSON
    return step.description ?? '';
}

// Lab1Layout
const Lab1Layout = ({data, onExecuteStep, lastExecutedStep, runHistory = []}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [highlightedPartition, setHighlightedPartition] = useState(null);

    // When data updates after an edited step run, navigate to that step
    // so the student immediately sees the effect of their change.
    useEffect(() => {
        if (lastExecutedStep != null) {
            setCurrentStep(lastExecutedStep);
            setHighlightedPartition(null);
        }
    }, [data, lastExecutedStep]);

    const pipeline = data?.spark_internals?.transformation_pipeline ?? [];

    if (!pipeline.length) return <div style={{padding: 20}}>Loading Spark execution data…</div>;

    const activeStepData = pipeline[currentStep - 1];
    const keyConcept = deriveKeyConcept(activeStepData);

    const handlePartitionClick = (pid) => {
        setHighlightedPartition(prev => prev === pid ? null : pid);
    };

    return (
        <div className="layout-container">

            {/* ── Stepper ── */}
            <div className="header">
                {pipeline.map(stepData => (
                    <button
                        key={stepData.step}
                        className={`step-btn ${currentStep === stepData.step ? 'active' : ''}`}
                        onClick={() => {
                            setCurrentStep(stepData.step);
                            setHighlightedPartition(null); // reset cross-filter on step change
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
                <div className="panel-title">Data Panel</div>

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
                                fontSize: '11px',
                                fontWeight: 'bold',
                                background: '#fce4ec',
                                color: '#880e4f',
                                padding: '3px 8px',
                                borderRadius: '4px'
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

                {/* Stats row — partition counts + shuffle info from JSON */}
                <StatsRow
                    currentStep={currentStep}
                    data={data}
                />

                {/* Data volume bar */}
                <div style={{
                    border: '1px solid var(--grey-200)',
                    padding: '14px 16px',
                    background: '#fff',
                    borderRadius: '6px'
                }}>
                    <h3 style={{
                        marginTop: 0,
                        marginBottom: '10px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        color: 'var(--grey-700)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
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

                {/* Partition timing chart — shown on step 2 */}
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