import React, {useState} from 'react';
import GlassTable from './GlassTable';
import {StatCell, StatsCard} from './StatsCard';
import CoefficientChart from './CoefficientChart';
import PredictionScatter from './PredictionScatter';
import PipelineFlowDiagram from './PipelineFlowDiagram';
import FeatureScatter from './FeatureScatter';
import SplitPartitionDiagram from './SplitPartitionDiagram';
import ToPandasDiagram from './ToPandasDiagram';
import PiEstimationDiagram from './PiEstimationDiagram';
import RDDConceptsPanel from './RDDConceptsPanel';
import RegularisationHistory from './RegularisationHistory';
import PiHistoryChart from './PiHistoryChart';
import LabVisualisationErrorBoundary from './LabVisualisationErrorBoundary';

//Step 1: RDD Concepts + Monte Carlo π animation + optional exercise history chart
export function Step1Panel({data, piHistory}) {
    return (<>
        <LabVisualisationErrorBoundary
            key={`pi-${data.pi_estimation?.num_samples}-${data.pi_estimation?.num_partitions}`}
            title="Pi Estimation Diagram unavailable"
            requiredFields={['pi_estimation.num_partitions', 'spark_internals.partition_story.num_partitions']}
        >
            <PiEstimationDiagram
                piData={data.pi_estimation}
                partitionCount={data?.spark_internals?.partition_story?.num_partitions}
            />
        </LabVisualisationErrorBoundary>

        {/* Optional Exercise (Lab Section 5) — history chart builds up as the
            student reruns with different NUM_PARTITIONS / NUM_SAMPLES combinations. */}
        <PiHistoryChart piHistory={piHistory}/>

        <RDDConceptsPanel
            concepts={data.rdd_concepts}
            piEstimation={data.pi_estimation}
        />
    </>);
}

//Step 2: Load CSV — schema, describe, sample
export function Step2Panel({data}) {
    const df = data.dataframe;
    if (!df) return <p style={{color: 'var(--grey-500)'}}>Run the notebook to see results.</p>;
    return (<>
        <StatsCard>
            <StatCell label="Rows" value={df.total_rows?.toLocaleString()} accent/>
            <StatCell label="Columns" value={df.schema?.length}/>
            <StatCell label="Partitions" value={df.csv_partitions}/>
        </StatsCard>

        <GlassTable
            title="Schema" badge=".printSchema()"
            columns={['name', 'type', 'nullable']}
            rows={df.schema}/>

        <GlassTable
            title="Summary Statistics" badge=".describe()"
            columns={df.describe?.[0] ? Object.keys(df.describe[0]) : []}
            rows={df.describe}/>

        <GlassTable
            title="Sample Data" badge="FIRST 10 ROWS"
            columns={df.schema?.map(f => f.name) ?? []}
            rows={df.sample_rows} maxRows={10}/>
    </>);
}

//Step 3: Feature Selection / VectorAssembler
export function Step3Panel({data}) {
    const fe = data.feature_engineering;
    if (!fe) return <p style={{color: 'var(--grey-500)'}}>Run the notebook to see results.</p>;
    return (<>
        <StatsCard>
            <StatCell label="Feature columns" value={fe.feature_cols?.join(', ')} accent/>
            <StatCell label="Vector length" value={fe.vector_length}/>
            <StatCell label="Label" value="sales"/>
        </StatsCard>

        {/* VectorAssembler concept callout */}
        <div style={{
            border: '1px solid #d9c8ff',
            borderRadius: '6px',
            borderLeft: '4px solid #0072B2',
            padding: '12px 16px',
            background: '#f0f8ff',
            fontSize: '12px',
            color: 'var(--grey-700)'
        }}>
            <strong style={{color: '#0072B2', fontFamily: 'var(--font-mono)'}}>
                VectorAssembler
            </strong>{' '}
            packs feature columns into a single dense Vector column. On HPC:
            <pre style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '8px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                margin: '8px 0 4px',
                lineHeight: 1.5,
                overflowX: 'auto'
            }}>
{`assembler = VectorAssembler(
    inputCols=["TV", "radio", "newspaper"],
    outputCol="features"
)
assembled = assembler.transform(df)
# features column: DenseVector([230.1, 37.8, 69.2])`}
            </pre>
            On Serverless, <code>VectorAssembler</code> is blocked by the Py4J whitelist.
            We select columns with the DataFrame API and convert to pandas so the concept is identical.
        </div>

        <GlassTable
            title="Selected Features" badge="FIRST 5 ROWS"
            columns={fe.feature_cols ? [...fe.feature_cols, 'label'] : []}
            rows={fe.sample}/>

        {/* No coefficients passed — shows raw data clouds only.
            Regression lines and coefficient labels appear at Step 5 once the model has been fitted.
            key encodes the column set so React fully remounts when columns change, preventing
            stale D3 event handlers showing values for removed columns on hover. */}
        <FeatureScatter
            key={'step3-' + (fe.feature_cols?.join(',') ?? '')}
            allRows={fe.all_rows}
            featureCols={fe.feature_cols}
        />

        {fe.note && (<div style={{
            border: '1px solid var(--grey-300)',
            borderRadius: '6px',
            padding: '10px 14px',
            background: '#fff',
            borderLeft: '4px solid #E69F00',
            fontSize: '12px',
            color: 'var(--grey-600)'
        }}>
            <strong style={{color: '#b45309'}}>Serverless constraint:</strong>{' '}
            {fe.note}
        </div>)}
    </>);
}

//Step 4: Train/Test Split
export function Step4Panel({data}) {
    const s = data.train_test_split;
    if (!s) return <p style={{color: 'var(--grey-500)'}}>Run the notebook to see results.</p>;
    return (<>
        <StatsCard>
            <StatCell label="Training rows" value={`${s.train_count} (${s.actual_train_pct}%)`} accent/>
            <StatCell label="Test rows" value={`${s.test_count} (${s.actual_test_pct}%)`}/>
            <StatCell label="Seed" value={s.seed}/>
        </StatsCard>

        {/* Split bar */}
        <div style={{
            border: '1px solid var(--grey-300)',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#fff'
        }}>
            <div style={{
                padding: '10px 16px',
                background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{
                    fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--grey-900)'
                }}>Data Split</span>
                <span style={{
                    fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
                    background: '#fff3e0', color: '#e65100', border: '1px solid #ffe0b2'
                }}>NARROW — NO SHUFFLE</span>
            </div>
            <div style={{padding: '16px'}}>
                <div style={{display: 'flex', borderRadius: '4px', overflow: 'hidden', height: '36px'}}>
                    <div style={{
                        flex: s.actual_train_pct, background: '#0072B2', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)'
                    }}>Train {s.actual_train_pct}%
                    </div>
                    <div style={{
                        flex: s.actual_test_pct, background: '#D55E00', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)'
                    }}>Test {s.actual_test_pct}%
                    </div>
                </div>
                <p style={{margin: '10px 0 0', fontSize: '12px', color: 'var(--grey-500)'}}>
                    Each partition independently hashes rows into buckets — no data moves between
                    partitions. .toPandas() then collects the small splits to the driver for scikit-learn.
                </p>
            </div>
        </div>

        <LabVisualisationErrorBoundary
            title="Split Partition Diagram unavailable"
            requiredFields={['train_test_split.split_rows', 'feature_engineering.feature_cols']}
        >
            <SplitPartitionDiagram
                splitRows={s.split_rows}
                trainCount={s.train_count}
                testCount={s.test_count}
                seed={s.seed}
                featureCols={s.feature_cols ?? data?.feature_engineering?.feature_cols}
            />
        </LabVisualisationErrorBoundary>

        {/* Seeding explainer */}
        <div style={{border: '1px solid var(--grey-300)', borderRadius: '6px', background: '#fff'}}>
            <div style={{
                padding: '10px 16px', background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
                <span style={{
                    fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--grey-900)'
                }}>
                    Why seed = {s.seed}?
                </span>
                <span style={{
                    fontSize: '10px', fontWeight: 'bold', padding: '2px 6px',
                    borderRadius: '4px', background: '#f0e6ff', color: '#440099'
                }}>
                    REPRODUCIBILITY
                </span>
            </div>
            <div style={{padding: '12px 16px', fontSize: '12px', color: 'var(--grey-700)', lineHeight: 1.6}}>
                <p style={{margin: '0 0 10px'}}>
                    <code>randomSplit([0.6, 0.4], seed={s.seed})</code> is deterministic meaning that
                    given the same DataFrame, same ratio and same seed, Spark always assigns
                    the <strong>same rows</strong> to train and test. The seed initialises the
                    per-partition hash function that decides each row's bucket.
                </p>
                <div style={{
                    background: '#f8faff', border: '1px solid #d0e1f9',
                    borderRadius: '4px', padding: '8px 12px', marginBottom: '10px'
                }}>
                    <div style={{fontWeight: 'bold', color: 'var(--grey-700)', marginBottom: '4px'}}>
                        What happens if you change the seed?
                    </div>
                    <ul style={{margin: '4px 0 0 16px', padding: 0}}>
                        <li><strong>Same 60/40 split proportion</strong> (approximately).</li>
                        <li><strong>Different rows land in each bucket.</strong> A row assigned to TRAIN
                            under seed 6012 may end up in TEST under seed 42.
                        </li>
                        <li><strong>Different train/test RMSE at Step 5</strong> because the model
                            trains on a different subset.
                        </li>
                        <li><strong>Reproducibility lost</strong> unless you fix the seed, without one,
                            every run would split differently, making results impossible to compare.
                        </li>
                    </ul>
                </div>
                <p style={{margin: 0, fontSize: '11px', color: 'var(--grey-500)'}}>
                    <strong>Try it:</strong> change <code>split_seed = {s.seed}</code> to{' '}
                    <code>42</code> or <code>2024</code> in the code panel, click Run, then click
                    the train and test bars above to see that the first-five rows have changed.
                    Any fixed integer works — 6012 is just the course code. Rerun the same seed
                    and the same rows come back.
                </p>
            </div>
        </div>

        <GlassTable title="Training Sample" badge="FIRST 5"
                    columns={s.train_sample?.[0] ? Object.keys(s.train_sample[0]) : []}
                    rows={s.train_sample} maxRows={5}/>

        <GlassTable title="Test Sample" badge="FIRST 5"
                    columns={s.test_sample?.[0] ? Object.keys(s.test_sample[0]) : []}
                    rows={s.test_sample} maxRows={5}/>
    </>);
}

//Step 5: LR Fit + Regularisation history
export function Step5Panel({data, regHistory}) {
    const lr = data.linear_regression;
    if (!lr) return <p style={{color: 'var(--grey-500)'}}>Run the notebook to see results.</p>;
    return (<>
        <StatsCard>
            <StatCell label="Train RMSE" value={lr.train_rmse?.toFixed(4)} accent/>
            <StatCell label="Train R²" value={lr.train_r2?.toFixed(4)}/>
            <StatCell label="Intercept" value={lr.intercept?.toFixed(4)}/>
            <StatCell label="Engine" value="scikit-learn"/>
        </StatsCard>

        <LabVisualisationErrorBoundary
            title="toPandas Boundary Diagram unavailable"
            requiredFields={['spark_internals.partition_distribution[].row_count']}
        >
            <ToPandasDiagram
                trainCount={data?.train_test_split?.train_count}
                testCount={data?.train_test_split?.test_count}
                partitionDist={data?.spark_internals?.partition_distribution}
            />
        </LabVisualisationErrorBoundary>

        {/* key forces remount when column set changes, preventing stale D3 bars for removed columns */}
        <CoefficientChart
            key={lr.feature_cols?.join(',') ?? ''}
            coefficients={lr.coefficients}
            featureCols={lr.feature_cols}
            intercept={lr.intercept}
        />

        {/* Same scatter as Step 3 — now with regression lines added.
            Students see the same data they explored at feature selection,
            and can now read why each coefficient has the value it does. */}
        <FeatureScatter
            key={'step5-' + (lr.feature_cols?.join(',') ?? '')}
            allRows={data?.feature_engineering?.all_rows}
            featureCols={lr.feature_cols}
            coefficients={lr.coefficients}
            coefficientsOriginalScale={lr.coefficients_original_scale}
        />

        {/* Regularisation history — appears after the first run with reg_param */}
        {regHistory.length > 0 && (<RegularisationHistory
            regHistory={regHistory}
            currentRegParam={data?.linear_regression?.reg_param}
        />)}

        <GlassTable
            title="Learned Coefficients"
            badge="CURRENT RUN"
            columns={['feature', 'coeff (standardised)', 'coeff (original scale)', 'interpretation']}
            rows={lr.feature_cols?.map((c, i) => {
                const stdCoeff = lr.coefficients?.[i];
                const origCoeff = lr.coefficients_original_scale?.[i] ?? stdCoeff;
                return {
                    feature: c,
                    'coeff (standardised)': stdCoeff,
                    'coeff (original scale)': origCoeff,
                    interpretation: `+£1k ${c} → ${origCoeff > 0 ? '+' : ''}${origCoeff?.toFixed(4)} sales`
                };
            })}/>
    </>);
}

//Step 6: Prediction & Evaluation
export function Step6Panel({data}) {
    const lr = data.linear_regression;
    if (!lr) return <p style={{color: 'var(--grey-500)'}}>Run the notebook to see results.</p>;
    return (<>
        <StatsCard>
            <StatCell label="Test RMSE" value={lr.test_rmse?.toFixed(4)} accent/>
            <StatCell label="Test R²" value={lr.test_r2?.toFixed(4)}/>
            <StatCell label="Predictions" value={lr.prediction_samples?.length}/>
        </StatsCard>

        <PredictionScatter
            predictions={lr.prediction_samples}
            testRmse={lr.test_rmse}
            testR2={lr.test_r2}
            featureCols={lr.feature_cols}
        />

        <GlassTable
            title="Prediction Detail"
            columns={['label', 'prediction', 'residual', 'features']}
            rows={lr.prediction_samples} maxRows={15}/>
    </>);
}

//Step 7: ML Pipeline — split into three pedagogical sub-steps that mirror the lab
//  7a — New example introduction, training data, pipeline stage definitions
//  7b — fit() as type transformation: Estimator -> Model
//  7c — transform() on test data, Exercise 5
export function Step7Panel({data}) {
    const pl = data.ml_pipeline;
    const [subStep, setSubStep] = useState('7a');
    if (!pl) return <p style={{color: 'var(--grey-500)'}}>Run the notebook to see results.</p>;

    const tabs = [
        {id: '7a', label: '7a — Training data'},
        {id: '7b', label: '7b — .fit() type transform'},
        {id: '7c', label: '7c — Exercise 5 predictions'},
    ];

    return (<>
        {/* Prominent banner + sub-step tabs at the very top of the data panel
            — makes it unmistakable that step 7 is a separate exercise split into three views */}
        <div style={{
            border: '2px solid var(--uos-purple)', borderRadius: '6px',
            background: '#faf5ff', padding: '12px 14px'
        }}>
            <div style={{
                fontSize: '11px', fontWeight: 'bold', color: 'var(--uos-purple)',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                marginBottom: '8px', fontFamily: 'var(--font-mono)'
            }}>
                ML Pipeline exercise — separate from steps 3–6 (Advertising). Follow 7a → 7b → 7c.
            </div>
            <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setSubStep(t.id)} style={{
                        padding: '8px 14px', borderRadius: '4px', cursor: 'pointer',
                        border: subStep === t.id ? '2px solid var(--uos-purple)' : '1px solid var(--grey-300)',
                        background: subStep === t.id ? 'var(--uos-purple)' : '#fff',
                        color: subStep === t.id ? '#fff' : 'var(--grey-700)',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)', fontSize: '12px'
                    }}>{t.label}</button>
                ))}
            </div>
        </div>

        <StatsCard>
            <StatCell label="Pipeline stages" value={pl.stages?.length} accent/>
            <StatCell label="Test documents" value={pl.test_data?.length}/>
            <StatCell label="Running on" value="scikit-learn"/>
            <StatCell label="spark.ml equiv" value="Tokenizer  HashingTF  LR"/>
        </StatsCard>

        {/* 7a — training data and pipeline definition */}
        {subStep === '7a' && (<>
            <div style={{
                border: '1px solid #d9c8ff', borderRadius: '6px',
                borderLeft: '4px solid var(--uos-purple)', padding: '12px 16px',
                background: '#faf5ff', fontSize: '13px', color: 'var(--grey-700)'
            }}>
                <strong style={{color: 'var(--uos-purple)'}}>New example.</strong>{' '}
                Classifying short text documents as <em>Spark-related</em> (1) or <em>not</em> (0).
                This is a separate example from steps 3–6, which used the Advertising dataset
                to predict sales. Here the model sees short strings of space-separated words
                and learns which words indicate Spark content.
            </div>

            <GlassTable
                title="Training Data" badge="4 LABELLED DOCUMENTS"
                columns={['id', 'text', 'label']}
                rows={pl.training_data}/>

            {/* spark.ml <-> scikit-learn stage mapping */}
            {pl.stages && pl.stages.length > 0 && (<div style={{
                border: '1px solid #d9c8ff', borderRadius: '6px',
                borderLeft: '4px solid #0072B2', padding: '12px 16px', background: '#f0f8ff'
            }}>
                <div style={{
                    fontSize: '10px', fontWeight: 'bold', color: '#0072B2', textTransform: 'uppercase',
                    letterSpacing: '0.5px', marginBottom: '10px', fontFamily: 'var(--font-mono)'
                }}>
                    Pipeline stages — spark.ml equivalent on HPC
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                    {pl.stages.map((s, i) => (<div key={i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '12px'
                    }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)', fontWeight: 'bold',
                            color: 'var(--grey-400)', minWidth: 20
                        }}>{i + 1}.</span>
                        <div>
                            <strong style={{fontFamily: 'var(--font-mono)', color: 'var(--grey-800)'}}>
                                {s.name}
                            </strong>
                            <span style={{color: 'var(--grey-400)', margin: '0 8px'}}>→</span>
                            <span style={{fontFamily: 'var(--font-mono)', color: 'var(--grey-500)', fontSize: '11px'}}>
                                spark.ml:{' '}
                            </span>
                            <strong style={{fontFamily: 'var(--font-mono)', color: '#0072B2'}}>
                                {s.spark_equivalent}
                            </strong>
                        </div>
                    </div>))}
                </div>
                <p style={{margin: '10px 0 0', fontSize: '11px', color: 'var(--grey-400)'}}>
                    These stages are defined but not yet fitted. Move to tab 7b to see what fit() does to them.
                </p>
            </div>)}
        </>)}

        {/* 7b — fit() as type transformation, isolated from the trace */}
        {subStep === '7b' && (
            <LabVisualisationErrorBoundary
                title="Pipeline Flow Diagram unavailable"
                requiredFields={['ml_pipeline.stages[].name', 'ml_pipeline.stages[].type']}
            >
                <PipelineFlowDiagram view="types" stages={pl.stages}/>
            </LabVisualisationErrorBoundary>
        )}

        {/* 7c — Exercise 5: transform() predictions on test data */}
        {subStep === '7c' && (<>
            <div style={{
                border: '1px solid #ffe0b2', borderRadius: '6px',
                borderLeft: '4px solid #E69F00', padding: '10px 14px',
                background: '#fff8e1', fontSize: '12px', color: 'var(--grey-700)'
            }}>
                <strong style={{color: '#b45309'}}>Exercise 5:</strong>{' '}
                the code panel defaults to the three exercise documents.
                Predict each label from the training data, then click Run and check.
            </div>

            <LabVisualisationErrorBoundary
                title="Pipeline Flow Diagram unavailable"
                requiredFields={['ml_pipeline.stages[].name', 'ml_pipeline.stages[].type']}
            >
                <PipelineFlowDiagram
                    view="trace"
                    stages={pl.stages}
                    traces={pl.traces}
                    predictions={pl.predictions}
                />
            </LabVisualisationErrorBoundary>

            <GlassTable
                title="Predictions"
                columns={['id', 'text', 'prediction', 'prob_0', 'prob_1']}
                rows={pl.predictions?.map(r => ({
                    id: r.id, text: r.text, prediction: r.prediction,
                    prob_0: r.probability?.[0], prob_1: r.probability?.[1]
                }))}/>

            <div style={{
                border: '1px solid var(--grey-300)', borderRadius: '6px',
                borderLeft: '4px solid #009E73', padding: '10px 14px',
                background: '#f0fdf4', fontSize: '12px', color: 'var(--grey-700)',
                lineHeight: 1.6
            }}>
                <strong style={{color: '#15803d'}}>Reading the table:</strong>{' '}
                <code>prob_0</code> is the model's confidence the document is <em>not</em> Spark-related,{' '}
                <code>prob_1</code> is its confidence the document <em>is</em> Spark-related. They always sum to 1.
                The <code>prediction</code> column is whichever is higher — so{' '}
                <code>prob_1 &gt; 0.5 → label 1</code>, otherwise label 0. Confidence is measured by distance
                from 0.5: a prob of 0.99 is near-certain, 0.55 is basically a coin flip.
            </div>
        </>)}
    </>);
}