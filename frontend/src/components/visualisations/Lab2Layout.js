import React, {useState, useEffect} from 'react';
import './Lab1Layout.css';
import CodePanel from './CodePanel';
import Lab2ClusterView from './Lab2ClusterView';
import {Step1Panel, Step2Panel, Step3Panel, Step4Panel, Step5Panel, Step6Panel, Step7Panel} from './StepPanels';


//Key concept text
function deriveKeyConcept(stepIndex, data) {
    switch (stepIndex) {
        case 1:
            return `RDD (Resilient Distributed Dataset) is Spark's original parallel data abstraction — ` +
                `a collection of elements partitioned across cluster nodes, operated on in parallel. ` +
                `Broadcast variables cache read-only data on every worker to avoid per-task copies. ` +
                `Accumulators are write-only shared counters — only the driver can read the final value. ` +
                `On Databricks Serverless the SparkContext RDD API is blocked; DataFrames are the equivalent.`;
        case 2:
            return `DataFrame from CSV — Spark infers the schema automatically (${data?.dataframe?.schema?.length ?? '?'} columns, ${data?.dataframe?.total_rows ?? '?'} rows). ` +
                `The CSV lands in ${data?.dataframe?.csv_partitions ?? '?'} partition(s) — small files don't benefit from splitting.`;
        case 3:
            return `VectorAssembler packs feature columns into a single dense Vector column for spark.ml. ` +
                `On HPC: VectorAssembler(inputCols=["TV","radio","newspaper"], outputCol="features"). ` +
                `On Serverless, spark.ml constructors are blocked by the Py4J whitelist, so we select columns ` +
                `with the DataFrame API and hand off to scikit-learn via .toPandas(). The concept is identical — ` +
                `features are packed together; the transport layer differs.`;
        case 4: {
            const s = data?.train_test_split;
            return `randomSplit([${s?.split_ratio?.join(', ') ?? '0.6, 0.4'}], seed=${s?.seed ?? '6012'}) is a NARROW transformation — no shuffle. ` +
                `Each partition independently assigns rows using a deterministic hash. ` +
                `Result: ${s?.train_count ?? '?'} train (${s?.actual_train_pct ?? '?'}%), ${s?.test_count ?? '?'} test (${s?.actual_test_pct ?? '?'}%).`;
        }
        case 5: {
            const lr = data?.linear_regression;
            return `fit() trains the model. The coefficients show each feature's impact on sales: ` +
                `TV (${lr?.coefficient_names?.TV?.toFixed(3) ?? '?'}) dominates, radio (${lr?.coefficient_names?.radio?.toFixed(3) ?? '?'}) contributes, ` +
                `newspaper (${lr?.coefficient_names?.newspaper?.toFixed(3) ?? '?'}) is near zero. ` +
                `Edit reg_param in the code panel (try 0.1, 1.0) and click Run — TV and radio shrink, newspaper may grow as it absorbs variance released by radio.`;
        }
        case 6: {
            const lr = data?.linear_regression;
            return `Each dot is a test row. Dots on the diagonal are perfectly predicted. ` +
                `The orange vertical lines are residuals — the prediction error per row. ` +
                `Test RMSE = ${lr?.test_rmse?.toFixed(4) ?? '?'}, R² = ${lr?.test_r2?.toFixed(4) ?? '?'}.`;
        }
        case 7:
            return `A Pipeline chains Transformers and Estimators. The key insight: pipeline.fit(training) calls fit() on each Estimator stage, ` +
                `producing a Model, which IS a Transformer. So LogisticRegression (Estimator) becomes LogisticRegressionModel (Transformer). ` +
                `After fit(), the PipelineModel contains ONLY Transformers. model.transform(test) then flows data through each stage ` +
                `text -> tokens -> feature vector -> prediction. Click different Ids to trace their journey through the pipeline.`;
        default:
            return '';
    }
}

//Step badge
// Step 1: RDD conceptual reference
// Steps 2-4: Spark distributed operations
// Steps 5-7: Driver (scikit-learn) operations
function stepBadge(currentStep) {
    if (currentStep === 1) return {label: 'RDD CONCEPTS — SERVERLESS SAFE', bg: '#fff3e0', colour: '#e65100'};
    if (currentStep <= 4) return {label: 'SPARK DISTRIBUTED', bg: '#e6f1fb', colour: '#0072B2'};
    return {label: 'DRIVER — SCIKIT-LEARN', bg: '#fce4ec', colour: '#880e4f'};
}

const Lab2Layout = ({data, onExecuteStep, loading: _loading, lastExecutedStep}) => {
    const [currentStep, setCurrentStep] = useState(1);
    // Accumulated regularisation history
    const [regHistory, setRegHistory] = useState([]);
    // Accumulated pi run history: one entry per (partitions, samples) combination
    const [piHistory, setPiHistory] = useState([]);

    const toFiniteNumber = (value) => {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : null;
    };

    useEffect(() => {
        if (lastExecutedStep != null) setCurrentStep(lastExecutedStep);
    }, [data, lastExecutedStep]);

    // Accumulate history entry each time a new run arrives
    useEffect(() => {
        const lr = data?.linear_regression;
        const regParam = toFiniteNumber(lr?.reg_param);
        if (!Array.isArray(lr?.coefficients) || !Array.isArray(lr?.feature_cols) || regParam == null) return;
        const entry = {
            regParam,
            coefficients: lr.coefficients,
            featureCols: lr.feature_cols,
            testRmse: toFiniteNumber(lr?.test_rmse),
            timestamp: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
        };
        setRegHistory(prev => {
            const filtered = prev.filter(r => r.regParam !== entry.regParam);
            return [...filtered, entry].sort((a, b) => a.regParam - b.regParam);
        });
    }, [data]);

    // Accumulate pi run history — keyed by (partitions, samples) so re-running
    // the same combination refreshes timing rather than duplicating.
    useEffect(() => {
        const pi = data?.pi_estimation;
        if (!pi || pi.elapsed_ms == null || pi.num_partitions == null || pi.num_samples == null) return;
        const entry = {
            partitions: pi.num_partitions,
            samples: pi.num_samples,
            estimate: pi.estimate,
            error: pi.error ?? Math.abs((pi.estimate ?? 0) - Math.PI),
            elapsedMs: pi.elapsed_ms,
            timestamp: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
        };
        setPiHistory(prev => {
            const key = `${entry.partitions}-${entry.samples}`;
            const filtered = prev.filter(r => `${r.partitions}-${r.samples}` !== key);
            return [...filtered, entry].slice(-10);
        });
    }, [data]);

    const combinedRegHistory = regHistory;

    const pipeline = data?.spark_internals?.transformation_pipeline ?? [];

    if (!pipeline.length) return <div style={{padding: 20}}>Loading Spark execution data…</div>;

    const activeStepData = pipeline[currentStep - 1];
    const keyConcept = deriveKeyConcept(currentStep, data);
    const badge = stepBadge(currentStep);

    const handleSaveTrace = () => {
        // Stamp _lab so Load Trace can route unambiguously without relying on heuristics
        const traceWithMeta = {...data, _lab: 'lab2'};
        const blob = new Blob([JSON.stringify(traceWithMeta, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spark-trace-lab2-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    //Step-specific data panel content
    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return <Step1Panel data={data} piHistory={piHistory}/>;
            case 2:
                return <Step2Panel data={data}/>;
            case 3:
                return <Step3Panel data={data}/>;
            case 4:
                return <Step4Panel data={data}/>;
            case 5:
                return <Step5Panel data={data} regHistory={combinedRegHistory}/>;
            case 6:
                return <Step6Panel data={data}/>;
            case 7:
                return <Step7Panel data={data}/>;
            default:
                return null;
        }
    };

    // ClusterView renders above step content on every step except Step 1, 3 and 7
    const renderDataPanel = () => (<>
        {currentStep !== 1 && currentStep !== 7 && currentStep !== 3 &&(<Lab2ClusterView
            currentStep={currentStep}
            data={data}
            sampleRows={data?.dataframe?.sample_rows}
            trainSample={data?.train_test_split?.train_sample}
            testSample={data?.train_test_split?.test_sample}
        />)}
        {renderStepContent()}
    </>);

    return (<div className="layout-container">

        {/*Stepper*/}
        <div className="header">
            {pipeline.map(s => (<button
                key={s.step}
                className={`step-btn ${currentStep === s.step ? 'active' : ''}`}
                onClick={() => setCurrentStep(s.step)}
            >
                Step {s.step}
            </button>))}
        </div>

        {/*Code panel*/}
        <div className="code-panel">
            <CodePanel
                currentStep={currentStep}
                onExecuteStep={onExecuteStep}
                data={data}
            />
        </div>

        {/*Data panel*/}
        <div className="data-panel">

            {/* Trace row */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0'
            }}>
                <div className="panel-title" style={{margin: 0}}>Data Panel</div>
                <button onClick={handleSaveTrace} className="trace-btn">Save Trace</button>
            </div>

            {/* Step header */}
            <div style={{
                border: '1px solid var(--grey-200)', padding: '14px 16px', borderRadius: '6px', background: '#fff'
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px'
                }}>
                    <h2 style={{
                        margin: 0, fontSize: '15px', fontFamily: 'var(--font-mono)', color: 'var(--grey-900)'
                    }}>
                        {activeStepData.operation}
                    </h2>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        background: activeStepData.lazy ? '#f0e6ff' : '#e8f5e9',
                        color: activeStepData.lazy ? '#440099' : '#1b5e20',
                        padding: '3px 8px',
                        borderRadius: '4px'
                    }}>
                        {activeStepData.lazy ? 'LAZY' : 'ACTION'}
                    </span>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        background: badge.bg,
                        color: badge.colour,
                        padding: '3px 8px',
                        borderRadius: '4px'
                    }}>
                        {badge.label}
                    </span>
                </div>
                <p style={{margin: 0, fontSize: '13px', color: 'var(--grey-600)'}}>
                    {activeStepData.description}
                </p>
            </div>

            {/* Step-specific visualisations */}
            {renderDataPanel()}
        </div>

        {/*Key concept footer*/}
        <div className="bottom-panel">
            <div className="concept-text">
                <span className="concept-label">KEY CONCEPT —</span>
                {keyConcept}
            </div>
        </div>

    </div>);
};

export default Lab2Layout;