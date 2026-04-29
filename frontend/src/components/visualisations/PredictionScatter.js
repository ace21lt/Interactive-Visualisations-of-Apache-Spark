import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './Lab2Layout.css';

const PredictionScatter = ({predictions, testRmse, testR2, featureCols = []}) => {
    const svgRef = useRef();
    const wrapRef = useRef();
    const width = useContainerWidth(wrapRef);
    const [hovered, setHovered] = useState(null);

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
            .selectAll('line').attr('stroke', '#eee');
        g.append('g')
            .call(d3.axisLeft(y).ticks(6).tickSize(-IW).tickFormat(''))
            .selectAll('line').attr('stroke', '#eee');

        g.selectAll('.domain').remove();

        g.append('line')
            .attr('x1', x(lo)).attr('y1', y(lo))
            .attr('x2', x(hi)).attr('y2', y(hi))
            .attr('stroke', '#16a34a').attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.6);

        g.append('text')
            .attr('x', x(hi) - 4).attr('y', y(hi) + 14)
            .attr('text-anchor', 'end').attr('font-size', 10)
            .attr('fill', '#16a34a').attr('font-style', 'italic')
            .text('perfect prediction');

        g.selectAll('.dot')
            .data(predictions)
            .enter().append('circle')
            .attr('cx', d => x(d.label))
            .attr('cy', d => y(d.prediction))
            .attr('r', 0)
            .attr('fill', '#0072B2')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.8)
            .style('cursor', 'pointer')
            .on('mouseenter', function (event, d) {
                d3.select(this).attr('r', 7).attr('opacity', 1);
                setHovered(d);
            })
            .on('mouseleave', function () {
                d3.select(this).attr('r', 5).attr('opacity', 0.8);
                setHovered(null);
            })
            .transition().duration(600).delay((_, i) => i * 20)
            .attr('r', 5);

        g.selectAll('.residual-line')
            .data(predictions)
            .enter().append('line')
            .attr('x1', d => x(d.label)).attr('y1', d => y(d.prediction))
            .attr('x2', d => x(d.label)).attr('y2', d => y(d.label))
            .attr('stroke', '#D55E00').attr('stroke-width', 1)
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
        setHovered(null);
    }, [predictions, featureCols]);

    if (!predictions || predictions.length === 0) return null;

    return (
        <div className="viz-card">
            <div className="viz-card-header">
                <span className="viz-card-title">Predicted vs Actual</span>
                <div style={{display: 'flex', gap: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)'}}>
                    <span style={{color: '#0072B2'}}>RMSE: {testRmse?.toFixed(4) ?? '—'}</span>
                    <span style={{color: '#0072B2'}}>R²: {testR2?.toFixed(4) ?? '—'}</span>
                </div>
            </div>

            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', width: '100%', height: '320px'}} />
            </div>

            {hovered && (
                <div className="hover-detail">
                    Actual: {hovered.label.toFixed(2)} | Predicted: {hovered.prediction.toFixed(2)} |
                    Residual: <span style={{color: '#D55E00', fontWeight: 'bold'}}>{hovered.residual.toFixed(2)}</span>
                    {hovered.features && featureCols.length > 0 && (
                        <span>
                            {' '}| Features:{' '}
                            {featureCols.map((name, i) => {
                                const value = hovered.features[i];
                                if (value == null) return null;
                                return `${name}=${value.toFixed(1)}`;
                            }).filter(Boolean).join(', ')}
                        </span>
                    )}
                    {hovered.features && featureCols.length === 0 &&
                        <span> | Features: [{hovered.features.map(v => v.toFixed(1)).join(', ')}]</span>}
                </div>
            )}

            <div className="legend-row" style={{padding: '6px 16px', borderTop: '1px solid var(--grey-200)'}}>
                <span className="legend-item">
                    <span className="legend-item-dot" style={{background: '#0072B2'}} />
                    Data point
                </span>
                <span className="legend-item">
                    <span style={{width: 16, height: 0, borderTop: '2px dashed #16a34a', display: 'inline-block'}} />
                    Perfect prediction
                </span>
                <span className="legend-item">
                    <span style={{width: 16, height: 0, borderTop: '1px solid #D55E00', display: 'inline-block', opacity: 0.5}} />
                    Residual
                </span>
            </div>
        </div>
    );
};

export default PredictionScatter;
