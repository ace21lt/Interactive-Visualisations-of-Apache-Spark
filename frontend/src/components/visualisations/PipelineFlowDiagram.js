import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './PipelineFlowDiagram.css';


const TF = '#0072B2';   // Okabe-Ito blue   — Transformer
const EST = '#D55E00';   // Okabe-Ito vermillion — Estimator
const MODEL = '#009E73';   // Okabe-Ito green  — Model (was Estimator)

//Type diagram (SVG) 

function TypeDiagram({width, stages}) {
    const svgRef = useRef();
    let stageErrorMessage = null;
    if (stages != null) {
        if (!Array.isArray(stages)) {
            stageErrorMessage = 'PipelineFlowDiagram: "stages" must be an array when provided.';
        } else if (stages.length === 0) {
            stageErrorMessage = 'PipelineFlowDiagram: "stages" must be a non-empty array when provided.';
        } else {
            const badIndex = stages.findIndex(stage => !stage?.name || !stage?.type);
            if (badIndex >= 0) {
                stageErrorMessage = `PipelineFlowDiagram: stage at index ${badIndex} must include "name" and "type".`;
            }
        }
    }

    useEffect(() => {
        const svg = d3.select(svgRef.current);
        if (stageErrorMessage || !Array.isArray(stages) || stages.length === 0) {
            svg.selectAll('*').remove();
            return;
        }

        const W = Math.max(width, 300);
        const ml = 20, mr = 20;
        const IW = W - ml - mr;

        const beforeStages = stages.map((stage) => {
            const isEstimator = String(stage.type).toLowerCase().includes('estimator');
            return {
                label: stage.name,
                sub: isEstimator ? 'Estimator' : 'Transformer',
                fill: isEstimator ? EST : TF,
                isEstimator,
            };
        });
        const afterStages = beforeStages.map((stage, i) => {
            const modelLabel = stage.isEstimator && !stage.label.endsWith('Model')
                ? `${stage.label}Model`
                : stage.label;
            return {
                label: modelLabel,
                sub: 'Transformer',
                fill: stage.isEstimator ? MODEL : TF,
                delay: 700 + i * 200,
            };
        });
        const nStages = Math.max(beforeStages.length, 1);

        // Layout constants
        const boxW = Math.min(130, Math.floor((IW - 80) / nStages));
        const boxH = 52;
        const gap = Math.max(10, Math.floor((IW - nStages * boxW) / (nStages + 1)));
        const totalRowW = nStages * boxW + (nStages - 1) * gap;
        const rowX = (IW - totalRowW) / 2;   // centre the three boxes

        const row1Y = 28;                      // before-fit row top
        const fitY = row1Y + boxH + 16;       // fit() arrow baseline
        const row2Y = fitY + 26;               // after-fit row top
        const annoY = row2Y + boxH + 14;       // annotation text baseline
        const H = annoY + 28;

        svg
            .attr('width', W)
            .attr('height', H);
        svg.selectAll('*').remove();

        const g = svg.append('g').attr('transform', `translate(${ml},0)`);

        //Helper: draw one stage box 
        function drawBox(x, y, label, sublabel, fill, animated, delay) {
            const rect = g.append('rect')
                .attr('x', x).attr('y', y)
                .attr('width', boxW).attr('height', boxH)
                .attr('rx', 7)
                .attr('fill', fill);

            const nameEl = g.append('text')
                .attr('x', x + boxW / 2).attr('y', y + 22)
                .attr('text-anchor', 'middle')
                .attr('font-size', boxW < 110 ? 9 : 10)
                .attr('font-weight', 'bold').attr('fill', '#fff')
                .attr('font-family', 'var(--font-mono)')
                .text(label);

            const subEl = g.append('text')
                .attr('x', x + boxW / 2).attr('y', y + 38)
                .attr('text-anchor', 'middle')
                .attr('font-size', 9)
                .attr('fill', 'rgba(255,255,255,0.75)')
                .text(sublabel);

            if (animated) {
                rect.attr('opacity', 0).transition().delay(delay).duration(350).attr('opacity', 1);
                nameEl.attr('opacity', 0).transition().delay(delay + 80).duration(300).attr('opacity', 1);
                subEl.attr('opacity', 0).transition().delay(delay + 80).duration(300).attr('opacity', 1);
            }
        }

        //Helper: draw connector arrow between boxes 
        function drawArrow(fromBox, toBox, y, colour) {
            const x1 = rowX + fromBox * (boxW + gap) + boxW + 2;
            const x2 = rowX + toBox * (boxW + gap) - 2;
            const mid = y + boxH / 2;
            g.append('line')
                .attr('x1', x1).attr('y1', mid)
                .attr('x2', x2).attr('y2', mid)
                .attr('stroke', colour ?? 'var(--grey-300)')
                .attr('stroke-width', 1.5)
                .attr('marker-end', `url(#arr-${colour?.replace('#', '') ?? 'grey'})`);
        }

        // Arrow marker defs
        [TF, MODEL, 'var(--grey-300)'].forEach(colour => {
            const id = `arr-${colour.replace('#', '').replace(/[()]/g, '')}`;
            const defs = svg.append('defs');
            defs.append('marker')
                .attr('id', id)
                .attr('markerWidth', 6).attr('markerHeight', 6)
                .attr('refX', 5).attr('refY', 3)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,0 L6,3 L0,6 Z')
                .attr('fill', colour === 'var(--grey-300)' ? '#ccc' : colour);
        });

        //ROW 1: Before fit() 
        g.append('text')
            .attr('x', 0).attr('y', row1Y - 8)
            .attr('font-size', 10).attr('fill', 'var(--grey-400)')
            .attr('font-family', 'var(--font-mono)')
            .text('Before  .fit():');

        beforeStages.forEach((s, i) => {
            drawBox(rowX + i * (boxW + gap), row1Y, s.label, s.sub, s.fill, false, 0);
        });
        for (let i = 0; i < nStages - 1; i++) {
            drawArrow(i, i + 1, row1Y, null);
        }

        //.fit() vertical arrow 
        const fitCx = IW / 2;
        g.append('text')
            .attr('x', fitCx).attr('y', fitY + 4)
            .attr('text-anchor', 'middle')
            .attr('font-size', 12).attr('font-weight', 'bold')
            .attr('fill', EST)
            .attr('font-family', 'var(--font-mono)')
            .text('↓   pipeline.fit(training)   ↓');

        //ROW 2: After fit() 
        g.append('text')
            .attr('x', 0).attr('y', row2Y - 8)
            .attr('font-size', 10).attr('fill', 'var(--grey-400)')
            .attr('font-family', 'var(--font-mono)')
            .attr('opacity', 0)
            .transition().delay(600).duration(300).attr('opacity', 1)
            .text('After   .fit()  —  PipelineModel:');

        afterStages.forEach((s, i) => {
            drawBox(rowX + i * (boxW + gap), row2Y, s.label, s.sub, s.fill, true, s.delay);
        });

        // Arrows for after row
        Array.from({length: Math.max(0, nStages - 1)}, (_, i) => i).forEach(i => {
            const x1 = rowX + i * (boxW + gap) + boxW + 2;
            const x2 = rowX + (i + 1) * (boxW + gap) - 2;
            const mid = row2Y + boxH / 2;
            g.append('line')
                .attr('x1', x1).attr('y1', mid)
                .attr('x2', x2).attr('y2', mid)
                .attr('stroke', '#ccc').attr('stroke-width', 1.5)
                .attr('opacity', 0)
                .transition().delay(1050 + i * 200).duration(300).attr('opacity', 1);
        });

        const estimatorIdx = beforeStages.findIndex(s => s.isEstimator);
        if (estimatorIdx >= 0) {
            // Callout bracket on fitted model box
            const modelX = rowX + estimatorIdx * (boxW + gap);

            // Bracket line
            g.append('line')
                .attr('x1', modelX + boxW / 2).attr('y1', row2Y + boxH + 4)
                .attr('x2', modelX + boxW / 2).attr('y2', annoY - 6)
                .attr('stroke', MODEL).attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '3,3')
                .attr('opacity', 0)
                .transition().delay(1300).duration(300).attr('opacity', 1);

            // Annotation text — two lines
            g.append('text')
                .attr('x', modelX + boxW / 2).attr('y', annoY)
                .attr('text-anchor', 'middle')
                .attr('font-size', 9).attr('font-weight', 'bold')
                .attr('fill', MODEL)
                .attr('font-family', 'var(--font-mono)')
                .attr('opacity', 0)
                .transition().delay(1400).duration(300).attr('opacity', 1)
                .text('Estimator -> Model (Transformer)');

            g.append('text')
                .attr('x', modelX + boxW / 2).attr('y', annoY + 14)
                .attr('text-anchor', 'middle')
                .attr('font-size', 8).attr('fill', 'var(--grey-500)')
                .attr('opacity', 0)
                .transition().delay(1400).duration(300).attr('opacity', 1)
                .text('fit() consumed the Estimator, produced a Transformer');
        }

    }, [width, stages, stageErrorMessage]);

    if (stageErrorMessage) {
        throw new Error(stageErrorMessage);
    }

    if (stages == null) {
        return null;
    }

    return <svg ref={svgRef} style={{display: 'block', width: '100%'}}/>;
}

//Document trace panel (JSX)
function DocumentTrace({pred, trace}) {
    if (!pred) return null;

    const words = pred.text?.toLowerCase().split(/\s+/) ?? [];
    const prob = pred.probability ?? [0.5, 0.5];
    const nnz = trace?.num_nonzero ?? words.length;
    const vecLen = trace?.features_size ?? '?';
    const label = pred.prediction === 1 ? 'Spark-related (1)' : 'Not Spark-related (0)';

    const steps = [
        {
            stage: 'text',
            colour: 'var(--grey-500)',
            value: `"${pred.text}"`,
            sub: 'raw input',
        },
        {
            stage: 'Tokenizer',
            colour: TF,
            value: `[${words.join(', ')}]`,
            sub: `${words.length} token${words.length !== 1 ? 's' : ''}`,
        },
        {
            stage: 'HashingTF',
            colour: TF,
            value: `Vector(${vecLen}, nnz=${nnz})`,
            sub: `${nnz} non-zero feature${nnz !== 1 ? 's' : ''}`,
        },
        {
            stage: 'LR Model',
            colour: MODEL,
            value: label,
            sub: `P(0)=${prob[0]?.toFixed(3)}  P(1)=${prob[1]?.toFixed(3)}`,
        },
    ];

    return (
        <div className="pipeline-flow-trace-wrap">
            <div className="pipeline-flow-trace-title">
                model.transform — tracing document ID {pred.id} through the pipeline
            </div>
            <div className="pipeline-flow-trace-row">
                {steps.map((s, i) => (
                    <React.Fragment key={i}>
                        {/* Stage cell */}
                        <div
                            className="pipeline-flow-stage-cell"
                            style={{border: `1.5px solid ${s.colour}`, background: `${s.colour}0d`}}
                        >
                            <div className="pipeline-flow-stage-name" style={{color: s.colour}}>{s.stage}</div>
                            <div className="pipeline-flow-stage-value">{s.value}</div>
                            <div className="pipeline-flow-stage-sub">{s.sub}</div>
                        </div>
                        {/* Arrow between stages */}
                        {i < steps.length - 1 && (
                            <div className="pipeline-flow-stage-arrow">{'->'}</div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

const PipelineFlowDiagram = ({stages, traces, predictions, view = 'full'}) => {
    const wrapRef = useRef();
    const width = useContainerWidth(wrapRef);
    const [selectedDoc, setSelectedDoc] = useState(0);

    // Reset selection when predictions change so an old index can't point out of bounds
    useEffect(() => {
        setSelectedDoc(0);
    }, [predictions]);

    // types view only needs stages; trace/full also need predictions
    if (view !== 'types' && (!predictions || predictions.length === 0)) return null;
    if (!stages || stages.length === 0) return null;

    const pred = predictions?.[selectedDoc];
    const trace = traces?.[selectedDoc];

    return (
        <div className="pipeline-flow">

            {/*Card header*/}
            <div className="pipeline-flow-header">
                <span className="pipeline-flow-title">
                    ML Pipeline — Estimator {'->'} Model
                </span>

                {/* Document selector */}
                {view !== 'types' && (
                    <div className="pipeline-flow-doc-selector">
                    <span className="pipeline-flow-doc-label">
                        Trace document:
                    </span>
                        {predictions.map((p, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedDoc(i)}
                                className="pipeline-flow-doc-btn"
                                style={{
                                    border: selectedDoc === i ? '2px solid var(--uos-purple)' : '1px solid var(--grey-300)',
                                    background: selectedDoc === i ? '#f0e6ff' : '#fff',
                                    fontWeight: selectedDoc === i ? 'bold' : 'normal',
                                    color: selectedDoc === i ? 'var(--uos-purple)' : 'var(--grey-600)'
                                }}
                            >
                                ID {p.id}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/*Type diagram w*/}
            {view !== 'trace' && (
                <div ref={wrapRef} style={{padding: '16px 16px 4px'}}>
                    <TypeDiagram width={width - 32} stages={stages}/>
                </div>
            )}

            {/*Lab quote callout */}
            {view !== 'trace' && (
                <div className="pipeline-flow-quote" style={{borderLeft: `4px solid ${MODEL}`}}>
                    "An Estimator implements a method fit(), which accepts a DataFrame and produces a
                    Model, which is a Transformer. For example, a learning algorithm such as{' '}
                    <strong style={{fontStyle: 'normal', color: EST}}>LogisticRegression</strong>{' '}
                    is an Estimator, and calling fit() trains a{' '}
                    <strong style={{fontStyle: 'normal', color: MODEL}}>LogisticRegressionModel</strong>,
                    which is a Model and hence a{' '}
                    <strong style={{fontStyle: 'normal', color: TF}}>Transformer</strong>."
                    <div className="pipeline-flow-quote-source">
                        — Apache Spark ML Pipeline documentation / COM6012 Lab 2
                    </div>
                </div>
            )}

            {/*Divider */}
            {view === 'full' && (
                <div className="pipeline-flow-divider"/>
            )}

            {/*Document trace */}
            {view !== 'types' && <DocumentTrace pred={pred} trace={trace}/>}

            {/*Legend*/}
            <div className="pipeline-flow-legend">
                {[
                    {colour: TF, label: 'Transformer'},
                    {colour: EST, label: 'Estimator'},
                    {colour: MODEL, label: 'Model (was Estimator)'},
                ].map(({colour, label}) => (
                    <span key={label} className="pipeline-flow-legend-item">
                        <span className="pipeline-flow-legend-swatch" style={{background: colour}}/>
                        {label}
                    </span>
                ))}
            </div>
        </div>
    );
};

export default PipelineFlowDiagram;