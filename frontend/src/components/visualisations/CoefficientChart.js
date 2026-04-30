import React, {useRef, useEffect} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './Lab2Layout.css';
import { chartBlue, chartOrange, chartPurple, chartSky } from '../../theme/palette';

const CoefficientChart = ({coefficients, featureCols, intercept}) => {
    const svgRef = useRef();
    const wrapRef = useRef();
    const width = useContainerWidth(wrapRef);

    useEffect(() => {
        if (!coefficients || !featureCols) return;

        const W = width;
        const H = 200;
        const ml = 100, mr = 60, mt = 20, mb = 30;
        const IW = W - ml - mr;
        const IH = H - mt - mb;

        const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
        svg.selectAll('*').remove();

        const g = svg.append('g').attr('transform', `translate(${ml},${mt})`);

        const labels = [...featureCols, 'intercept'];
        const values = [...coefficients, intercept];
        const maxAbs = d3.max(values.map(Math.abs)) || 1;

        const x = d3.scaleLinear().domain([-maxAbs * 0.1, maxAbs * 1.15]).range([0, IW]);
        const y = d3.scaleBand().domain(labels).range([0, IH]).padding(0.35);

        g.append('line')
            .attr('x1', x(0)).attr('y1', 0)
            .attr('x2', x(0)).attr('y2', IH)
            .attr('stroke', 'var(--grey-300)').attr('stroke-width', 1)
            .attr('stroke-dasharray', '4,3');

        const barColours = [chartBlue, chartOrange, chartPurple, chartSky];
        g.selectAll('.coeff-bar')
            .data(values)
            .enter().append('rect')
            .attr('x', d => d >= 0 ? x(0) : x(d))
            .attr('y', (_, i) => y(labels[i]))
            .attr('height', y.bandwidth())
            .attr('rx', 3)
            .attr('fill', (_, i) => barColours[i % barColours.length])
            .attr('width', 0)
            .transition().duration(600).ease(d3.easeCubicOut)
            .attr('width', d => Math.abs(x(d) - x(0)));

        g.selectAll('.coeff-label')
            .data(values)
            .enter().append('text')
            .attr('x', d => d >= 0 ? x(d) + 6 : x(d) - 6)
            .attr('y', (_, i) => y(labels[i]) + y.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', d => d >= 0 ? 'start' : 'end')
            .attr('font-size', 12).attr('font-family', 'var(--font-mono)')
            .attr('font-weight', 'bold')
            .attr('fill', (_, i) => barColours[i % barColours.length])
            .attr('opacity', 0)
            .transition().duration(400).delay(500)
            .attr('opacity', 1)
            .text(d => d.toFixed(4));

        g.selectAll('.feat-label')
            .data(labels)
            .enter().append('text')
            .attr('x', -10)
            .attr('y', d => y(d) + y.bandwidth() / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .attr('font-size', 13).attr('font-family', 'var(--font-mono)')
            .attr('font-weight', 'bold')
            .attr('fill', 'var(--grey-700)')
            .text(d => d);

    }, [coefficients, featureCols, intercept, width]);

    if (!coefficients || !featureCols) return null;

    return (
        <div className="viz-card">
            <div className="viz-card-header">
                <div>
                    <span className="viz-card-title">Model Coefficients</span>
                    <span className="badge badge--live" style={{marginLeft: '8px'}}>CURRENT RUN</span>
                    <span style={{fontSize: '10px', marginLeft: '8px', color: 'var(--grey-400)', fontStyle: 'italic'}}>
                        standardised, larger bar means stronger predictor
                    </span>
                </div>
            </div>
            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', width: '100%', height: '200px'}} />
            </div>
        </div>
    );
};

export default CoefficientChart;
