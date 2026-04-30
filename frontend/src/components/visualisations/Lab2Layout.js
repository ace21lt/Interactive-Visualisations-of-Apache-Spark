import React, {useState, useEffect} from 'react';
import { useJoyride, STATUS } from 'react-joyride';
import './Lab1Layout.css';
import './Lab2Layout.css';
import CodePanel from './CodePanel';
import Lab2ClusterView from './Lab2ClusterView';
import {Step1Panel, Step2Panel, Step3Panel, Step4Panel, Step5Panel, Step6Panel, Step7Panel} from './StepPanels';
import { useTour } from '../../context/TourContext';
import { lab2Steps, joyrideConfig } from '../../config/tourSteps';

function deriveKeyConcept(stepIndex, data) {
    switch (stepIndex) {
        case 1:
            return `RDDs are Spark's original distributed data abstraction. Broadcast variables copy read-only data to every worker, and accumulators let only the driver read the final count. On Databricks Serverless, the DataFrame path is the supported route.`;
        case 2:
            return `Spark inferred ${data?.dataframe?.schema?.length ?? '?'} columns and ${data?.dataframe?.total_rows ?? '?'} rows from the CSV. The file landed in ${data?.dataframe?.csv_partitions ?? '?'} partition(s), which is why small files rarely split well.`;
        case 3:
            return `VectorAssembler packs the feature columns into one dense vector for spark.ml. On Serverless, the same idea is handled with the DataFrame API and then handed to scikit-learn through .toPandas().`;
        case 4: {
            const s = data?.train_test_split;
            return `randomSplit([${s?.split_ratio?.join(', ') ?? '0.6, 0.4'}], seed=${s?.seed ?? '6012'}) is a narrow transformation with no shuffle. Each partition splits rows deterministically, giving ${s?.train_count ?? '?'} train and ${s?.test_count ?? '?'} test rows.`;
        }
        case 5: {
            const lr = data?.linear_regression;
            return `fit() trains the model. TV (${lr?.coefficient_names?.TV?.toFixed(3) ?? '?'}) still dominates, radio (${lr?.coefficient_names?.radio?.toFixed(3) ?? '?'}) contributes, and newspaper (${lr?.coefficient_names?.newspaper?.toFixed(3) ?? '?'}) stays near zero. Try a different reg_param to see the coefficients rebalance.`;
        }
        case 6: {
            const lr = data?.linear_regression;
            return `Each dot is a test row. Dots on the diagonal are perfect predictions, and the orange lines show residual error. Test RMSE is ${lr?.test_rmse?.toFixed(4) ?? '?'}, with R² at ${lr?.test_r2?.toFixed(4) ?? '?'}.`;
        }
        case 7:
            return `Pipelines chain Transformers and Estimators. pipeline.fit(training) turns each Estimator into a Model, then model.transform(test) pushes data through every stage from text to prediction.`;
        default:
            return '';
    }
}

// Step 1 = RDD concepts (reference only), 2–4 = Spark distributed, 5–7 = driver/scikit-learn
function stepBadge(currentStep) {
    if (currentStep === 1) return {label: 'RDD concepts', cls: 'badge--rdd'};
    if (currentStep <= 4) return {label: 'Spark distributed', cls: 'badge--spark'};
    return {label: 'Driver, scikit-learn', cls: 'badge--driver'};
}

const Lab2Layout = ({data, onExecuteStep, loading: _loading, lastExecutedStep, piHistory = [], regHistory = [], splitHistory = []}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const { runTour, currentLabTour, startTour, endTour } = useTour();

    const { Tour } = useJoyride({
        steps: lab2Steps,
        run: runTour && currentLabTour === 'lab2',
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
        if (lastExecutedStep != null) setCurrentStep(lastExecutedStep);
    }, [data, lastExecutedStep]);

    // Auto-start tour on first visit
    useEffect(() => {
        const seen = localStorage.getItem('lab2_tour_seen') === 'true';
        if (!seen) {
            const timer = setTimeout(() => startTour('lab2'), 800);
            return () => clearTimeout(timer);
        }
    }, []);

    const pipeline = data?.spark_internals?.transformation_pipeline ?? [];

    if (!pipeline.length) return <div style={{padding: 20}}>Loading Spark execution data…</div>;

    const activeStepData = pipeline[currentStep - 1];
    const keyConcept = deriveKeyConcept(currentStep, data);
    const badge = stepBadge(currentStep);

    const handleSaveTrace = () => {
        const blob = new Blob([JSON.stringify({...data, _lab: 'lab2'}, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spark-trace-lab2-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 1:
                return <Step1Panel data={data} piHistory={piHistory}/>;
            case 2:
                return <Step2Panel data={data}/>;
            case 3:
                return <Step3Panel data={data}/>;
            case 4:
                return <Step4Panel data={data} splitHistory={splitHistory}/>;
            case 5:
                return <Step5Panel data={data} regHistory={regHistory}/>;
            case 6:
                return <Step6Panel data={data}/>;
            case 7:
                return <Step7Panel data={data}/>;
            default:
                return null;
        }
    };

    const renderDataPanel = () => (
        <>
            {currentStep !== 1 && currentStep !== 3 && currentStep !== 7 && (
                <Lab2ClusterView
                    currentStep={currentStep}
                    data={data}
                    sampleRows={data?.dataframe?.sample_rows}
                    trainSample={data?.train_test_split?.train_sample}
                    testSample={data?.train_test_split?.test_sample}
                />
            )}
            {renderStepContent()}
        </>
    );

    return (
        <div className="layout-container">
            {Tour}
            <div className="header">
                {pipeline.map(s => (
                    <button
                        key={s.step}
                        className={`step-btn ${currentStep === s.step ? 'active' : ''}`}
                        onClick={() => setCurrentStep(s.step)}
                    >
                        Step {s.step}
                    </button>
                ))}
            </div>

            <div className="code-panel">
                <CodePanel
                    currentStep={currentStep}
                    onExecuteStep={onExecuteStep}
                    data={data}
                />
            </div>

            <div className="data-panel">
                <div className="data-panel-header">
                            <div className="panel-title" style={{margin: 0}}>Run results</div>
                    <button onClick={handleSaveTrace} className="trace-btn">Save Trace</button>
                </div>

                <div className="step-header">
                    <div className="step-header-top">
                        <h2 className="step-header-title">{activeStepData.operation}</h2>
                        <span className={`badge ${activeStepData.lazy ? 'badge--lazy' : 'badge--action'}`}>
                            {activeStepData.lazy ? 'LAZY' : 'ACTION'}
                        </span>
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <p className="step-header-desc">{activeStepData.description}</p>
                </div>

                {renderDataPanel()}
            </div>

            <div className="bottom-panel">
                <div className="concept-text">
                    <span className="concept-label">Key Concept:</span>
                    {keyConcept}
                </div>
            </div>
        </div>
    );
};

export default Lab2Layout;

