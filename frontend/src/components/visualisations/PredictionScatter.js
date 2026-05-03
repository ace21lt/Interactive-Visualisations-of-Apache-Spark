import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './Lab2Layout.css';
import { okabeIto, chartGreen, neutralBorder, neutralWhite } from '../../theme/palette';

const PredictionScatter = ({predictions, testRmse, testR2, featureCols = []}) => {
    const svgRef = useRef();
    const wrapRef = useRef();
    const width = useContainerWidth(wrapRef);
    const [activePoint, setActivePoint] = useState(null);

    const formatValue = (value, digits = 2) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '-';
        return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits);
    };

    useEffect(() => {
        if (!predictions || predictions.length === 0) return;

        const W = width;
        const H = 320;
        const ml = 55, mr = 20, mt = 20, mb = 45;
        const IW = W - ml - mr;
        const IH = H - mt - mb;

        const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
        svg.selectAll('*').remove();

        const g = svg.append('g').attr('transform', `translate(${ml},${mt})`);

        const allVals = predictions.flatMap(p => [p.label, p.prediction]);
        const lo = d3.min(allVals) * 0.9;
        const hi = d3.max(allVals) * 1.1;

        const x = d3.scaleLinear().domain([lo, hi]).range([0, IW]);
        const y = d3.scaleLinear().domain([lo, hi]).range([IH, 0]);

        g.append('g')
            .call(d3.axisBottom(x).ticks(6).tickSize(-IH).tickFormat(''))
            .attr('transform', `translate(0,${IH})`)
            .selectAll('line').attr('stroke', neutralBorder);
        g.append('g')
            .call(d3.axisLeft(y).ticks(6).tickSize(-IW).tickFormat(''))
            .selectAll('line').attr('stroke', neutralBorder);

        g.selectAll('.domain').remove();

        g.append('line')
            .attr('x1', x(lo)).attr('y1', y(lo))
            .attr('x2', x(hi)).attr('y2', y(hi))
            .attr('stroke', chartGreen).attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.6);

        g.append('text')
            .attr('x', x(hi) - 4).attr('y', y(hi) + 14)
            .attr('text-anchor', 'end').attr('font-size', 10)
            .attr('fill', chartGreen).attr('font-style', 'italic')
            .text('perfect prediction');

        g.selectAll('.dot')
            .data(predictions)
            .enter().append('circle')
            .attr('cx', d => x(d.label))
            .attr('cy', d => y(d.prediction))
            .attr('r', 0)
            .attr('fill', okabeIto.blue)
            .attr('stroke', neutralWhite)
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.8)
            .style('cursor', 'pointer')
            .attr('data-idx', (_, i) => i)
            .attr('tabindex', 0)
            .attr('role', 'button')
            .attr('aria-label', (d, i) => {
                const residual = Math.abs(Number(d.residual ?? (d.prediction - d.label)));
                return `Actual ${formatValue(d.label)}, predicted ${formatValue(d.prediction)}, residual ${formatValue(residual)}. Point ${i + 1}. Press Enter or Space to keep the details visible.`;
            })
            .on('mouseenter focus', function (event, d) {
                const idx = Number(d3.select(this).attr('data-idx'));
                d3.select(this).attr('r', 7).attr('opacity', 1);
                setActivePoint({...d, _key: `prediction-${idx}`});
            })
            .on('mouseleave blur', function () {
                const idx = Number(d3.select(this).attr('data-idx'));
                d3.select(this).attr('r', 5).attr('opacity', 0.8);
                setActivePoint(prev => prev?._key === `prediction-${idx}` ? null : prev);
            })
            .on('keydown', function (event, d) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const idx = Number(d3.select(this).attr('data-idx'));
                setActivePoint({...d, _key: `prediction-${idx}`});
            })
            .transition().duration(600).delay((_, i) => i * 20)
            .attr('r', 5);

        g.selectAll('.residual-line')
            .data(predictions)
            .enter().append('line')
            .attr('x1', d => x(d.label)).attr('y1', d => y(d.prediction))
            .attr('x2', d => x(d.label)).attr('y2', d => y(d.label))
            .attr('stroke', okabeIto.orange).attr('stroke-width', 1)
            .attr('opacity', 0)
            .transition().duration(400).delay(800)
            .attr('opacity', 0.3);

        g.append('g')
            .attr('transform', `translate(0,${IH})`)
            .call(d3.axisBottom(x).ticks(6))
            .selectAll('text').attr('font-size', 11).attr('font-family', 'var(--font-mono)');

        g.append('text')
            .attr('x', IW / 2).attr('y', IH + 38)
            .attr('text-anchor', 'middle').attr('font-size', 12)
            .attr('fill', 'var(--grey-600)')
            .text('Actual sales');

        g.append('g')
            .call(d3.axisLeft(y).ticks(6))
            .selectAll('text').attr('font-size', 11).attr('font-family', 'var(--font-mono)');

        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -IH / 2).attr('y', -42)
            .attr('text-anchor', 'middle').attr('font-size', 12)
            .attr('fill', 'var(--grey-600)')
            .text('Predicted sales');

    }, [predictions, width]);

    useEffect(() => {
        setActivePoint(null);
    }, [predictions, featureCols]);

    if (!predictions || predictions.length === 0) return null;

    return (
        <div className="viz-card">
            <div className="viz-card-header">
                <span className="viz-card-title">Predicted vs Actual</span>
                <div style={{display: 'flex', gap: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)'}}>
                    <span style={{color: okabeIto.blue}}>RMSE: {testRmse?.toFixed(4) ?? '-'}</span>
                    <span style={{color: okabeIto.blue}}>R²: {testR2?.toFixed(4) ?? '-'}</span>
                </div>
            </div>

            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', width: '100%', height: '320px'}} />
            </div>

            <div className="hover-detail" role="status" aria-live="polite" aria-atomic="true">
                {activePoint ? (
                    <>
                        Actual: {formatValue(activePoint.label)} | Predicted: {formatValue(activePoint.prediction)} |
                        Residual: <span style={{color: okabeIto.orange, fontWeight: 'bold'}}>{formatValue(activePoint.residual ?? (activePoint.prediction - activePoint.label))}</span>
                        {activePoint.features && featureCols.length > 0 && (
                            <span>
                                {' '}| Features:{' '}
                                {featureCols.map((name, i) => {
                                    const value = activePoint.features[i];
                                    if (value == null) return null;
                                    return `${name}=${formatValue(value, 1)}`;
                                }).filter(Boolean).join(', ')}
                            </span>
                        )}
                        {activePoint.features && featureCols.length === 0 &&
                            <span> | Features: [{activePoint.features.map(v => formatValue(v, 1)).join(', ')}]</span>}
                    </>
                ) : (
                    <span>
                        Keyboard tip: tab to any point, then press Enter or Space to keep the prediction details visible.
                    </span>
                )}
            </div>

            <div className="legend-row" style={{padding: '6px 16px', borderTop: '1px solid var(--grey-200)'}}>
                <span className="legend-item">
                    <span className="legend-item-dot" style={{background: okabeIto.blue}} />
                    Data point
                </span>
                <span className="legend-item">
                    <span style={{width: 16, height: 0, borderTop: `2px dashed ${chartGreen}`, display: 'inline-block'}} />
                    Perfect prediction
                </span>
                <span className="legend-item">
                    <span style={{width: 16, height: 0, borderTop: `1px solid ${okabeIto.orange}`, display: 'inline-block', opacity: 0.5}} />
                    Residual
                </span>
            </div>
        </div>
    );
};

export default PredictionScatter;
