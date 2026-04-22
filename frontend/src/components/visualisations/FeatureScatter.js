import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';

// coefficients, standardised (from lr.coef_); used by CoefficientChart
// coefficientsOriginalScale — in original feature units; used here for regression line slopes
const FeatureScatter = ({allRows, featureCols, coefficients, coefficientsOriginalScale}) => {
    const wrapRef = useRef();
    const svgRef = useRef();
    const width = useContainerWidth(wrapRef);
    const [hovered, setHovered] = useState(null);

    useEffect(() => {
        if (!allRows || allRows.length === 0 || !featureCols) return;

        const cols = featureCols;
        const W = width;
        const plotW = Math.floor((W - 40) / cols.length);
        const plotH = 180;
        const ml = 40, mr = 10, mt = 24, mb = 32;
        const iw = plotW - ml - mr;
        const ih = plotH - mt - mb;
        const H = plotH;

        const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
        svg.selectAll('*').remove();

        const dotColours = ['#0072B2', '#E69F00', '#CC79A7'];

        // Store all dot selections for cross-highlighting
        const allDots = [];

        cols.forEach((col, ci) => {
            const gx = 10 + ci * (plotW + 8);
            const g = svg.append('g').attr('transform', `translate(${gx + ml},${mt})`);

            const xVals = allRows.map(r => r[col]);
            const yVals = allRows.map(r => r.label);

            const x = d3.scaleLinear().domain([0, d3.max(xVals) * 1.05]).range([0, iw]);
            const y = d3.scaleLinear().domain([0, d3.max(yVals) * 1.1]).range([ih, 0]);

            // Grid
            g.append('g')
                .call(d3.axisBottom(x).ticks(4).tickSize(-ih).tickFormat(''))
                .attr('transform', `translate(0,${ih})`)
                .selectAll('line').attr('stroke', '#f0f0f0');
            g.append('g')
                .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''))
                .selectAll('line').attr('stroke', '#f0f0f0');
            g.selectAll('.domain').remove();

            // Dots
            const dots = g.selectAll('.dot')
                .data(allRows)
                .enter().append('circle')
                .attr('cx', d => x(d[col]))
                .attr('cy', d => y(d.label))
                .attr('r', 3)
                .attr('fill', dotColours[ci])
                .attr('opacity', 0.55)
                .attr('data-idx', (_, i) => i)
                .style('cursor', 'pointer')
                .on('mouseenter', function (event, d) {
                    const idx = +d3.select(this).attr('data-idx');
                    // Highlight this dot across ALL plots
                    allDots.forEach(dotSet => {
                        dotSet.attr('opacity', (_, i) => i === idx ? 1 : 0.15)
                            .attr('r', (_, i) => i === idx ? 6 : 2.5);
                    });
                    setHovered({...d, _idx: idx});
                })
                .on('mouseleave', function () {
                    allDots.forEach(dotSet => {
                        dotSet.attr('opacity', 0.55).attr('r', 3);
                    });
                    setHovered(null);
                });

            dots.attr('r', 0)
                .transition().duration(400).delay((_, i) => i * 2)
                .attr('r', 3);

            allDots.push(dots);

            // Regression line uses original-scale coefficients so the slope
            // is in the same units as the x-axis (raw feature values).
            const lineCoeff = coefficientsOriginalScale?.[ci] ?? coefficients?.[ci];
            if (lineCoeff != null) {
                const meanY = d3.mean(yVals);
                const meanX = d3.mean(xVals);
                const slope = lineCoeff;
                const intercept = meanY - slope * meanX;
                const x0 = d3.min(xVals);
                const x1 = d3.max(xVals);

                g.append('line')
                    .attr('x1', x(x0)).attr('y1', y(slope * x0 + intercept))
                    .attr('x2', x(x1)).attr('y2', y(slope * x1 + intercept))
                    .attr('stroke', dotColours[ci]).attr('stroke-width', 2)
                    .attr('stroke-dasharray', '6,3').attr('opacity', 0)
                    .style('pointer-events', 'none')
                    .transition().duration(500).delay(500)
                    .attr('opacity', 0.7);
            }

            // X axis
            g.append('g')
                .attr('transform', `translate(0,${ih})`)
                .call(d3.axisBottom(x).ticks(4))
                .selectAll('text').attr('font-size', 9).attr('font-family', 'var(--font-mono)');

            // Y axis (first plot only)
            if (ci === 0) {
                g.append('g')
                    .call(d3.axisLeft(y).ticks(4))
                    .selectAll('text').attr('font-size', 9).attr('font-family', 'var(--font-mono)');

                g.append('text')
                    .attr('transform', 'rotate(-90)')
                    .attr('x', -ih / 2).attr('y', -30)
                    .attr('text-anchor', 'middle').attr('font-size', 10)
                    .attr('fill', 'var(--grey-500)')
                    .text('sales');
            }

            // Title
            svg.append('text')
                .attr('x', gx + ml + iw / 2).attr('y', 14)
                .attr('text-anchor', 'middle').attr('font-size', 12)
                .attr('font-weight', 'bold').attr('fill', dotColours[ci])
                .attr('font-family', 'var(--font-mono)')
                .text(col);

            // Coefficient label below x-axis — shows standardised value for relative comparison
            if (coefficients && coefficients[ci] != null) {
                svg.append('text')
                    .attr('x', gx + ml + iw / 2).attr('y', H - 2)
                    .attr('text-anchor', 'middle').attr('font-size', 9)
                    .attr('fill', 'var(--grey-400)').attr('font-family', 'var(--font-mono)')
                    .text(`coeff (std): ${coefficients[ci].toFixed(3)}`);
            }
        });

    }, [allRows, featureCols, coefficients, coefficientsOriginalScale, width]);

    useEffect(() => {
        setHovered(null);
    }, [allRows, featureCols]);

    if (!allRows || allRows.length === 0 || !featureCols) return null;

    const hasCoefficients = coefficients != null && coefficients.length > 0;

    return (<div style={{border: '1px solid var(--grey-300)', borderRadius: '6px', background: '#fff'}}>
        <div style={{
            padding: '10px 16px', background: 'var(--grey-50)', borderBottom: '2px solid var(--uos-purple)'
        }}>
                <span style={{
                    fontSize: '13px', fontWeight: 'bold', color: 'var(--grey-900)', fontFamily: 'var(--font-mono)'
                }}>
                    Feature vs Sales
                </span>
            {hasCoefficients ? (
                <span style={{
                    fontSize: '10px', fontWeight: 'bold', marginLeft: '8px',
                    padding: '2px 6px', borderRadius: '4px',
                    background: '#f0e6ff', color: '#440099'
                }}>WHY THESE COEFFICIENTS?</span>
            ) : (
                <span style={{
                    fontSize: '10px', fontWeight: 'bold', marginLeft: '8px',
                    padding: '2px 6px', borderRadius: '4px',
                    background: '#e6f1fb', color: '#0072B2'
                }}>EXPLORE THE DATA</span>
            )}
        </div>
        <div ref={wrapRef} style={{padding: '10px 0'}}>
            <svg ref={svgRef} style={{display: 'block', width: '100%', height: '180px'}}/>
        </div>

        {/* Hover detail — cross-filter readout */}
        {hovered ? (<div style={{
            padding: '6px 16px 10px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--grey-700)',
            borderTop: '1px solid var(--grey-200)'
        }}>
            {featureCols.filter(c => hovered[c] != null).map(c => (<span key={c} style={{marginRight: '12px'}}>
                            <strong>{c}:</strong> {hovered[c]?.toFixed(1)}
                        </span>))}
            <span><strong>sales:</strong> {hovered.label?.toFixed(1)}</span>
        </div>) : (
            <div style={{padding: '4px 16px 10px', fontSize: '11px', color: 'var(--grey-500)'}}>
                {hasCoefficients
                    ? 'Hover any dot to see its values across all three plots. Strong linear pattern = large coefficient.'
                    : 'Hover any dot to see its values across all three plots. Which features have a strong linear relationship with sales?'}
            </div>
        )}
    </div>);
};

export default FeatureScatter;