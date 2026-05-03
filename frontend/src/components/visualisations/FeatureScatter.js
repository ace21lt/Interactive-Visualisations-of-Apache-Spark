import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './Lab2Layout.css';
import { okabeIto } from '../../theme/palette';

const FeatureScatter = ({allRows, featureCols, coefficients, coefficientsOriginalScale}) => {
    const wrapRef = useRef();
    const svgRef = useRef();
    const width = useContainerWidth(wrapRef);
    const [activePoint, setActivePoint] = useState(null);

    const formatValue = (value, digits = 1) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return '-';
        return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits);
    };

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

        const dotColours = [okabeIto.blue, okabeIto.orange, okabeIto.purple];
        const allDots = [];

        const setHighlightedRow = (idx, point) => {
            allDots.forEach(dotSet => {
                dotSet.attr('opacity', (_, i) => i === idx ? 1 : 0.15)
                    .attr('r', (_, i) => i === idx ? 6 : 2.5);
            });
            setActivePoint(point);
        };

        const clearHighlightedRow = (idx, pointKey) => {
            setActivePoint(prev => {
                if (prev?.key !== pointKey) return prev;
                allDots.forEach(dotSet => {
                    dotSet.attr('opacity', 0.55).attr('r', 3);
                });
                return null;
            });
        };

        cols.forEach((col, ci) => {
            const gx = 10 + ci * (plotW + 8);
            const g = svg.append('g').attr('transform', `translate(${gx + ml},${mt})`);

            const xVals = allRows.map(r => r[col]);
            const yVals = allRows.map(r => r.label);

            const x = d3.scaleLinear().domain([0, d3.max(xVals) * 1.05]).range([0, iw]);
            const y = d3.scaleLinear().domain([0, d3.max(yVals) * 1.1]).range([ih, 0]);

            g.append('g')
                .call(d3.axisBottom(x).ticks(4).tickSize(-ih).tickFormat(''))
                .attr('transform', `translate(0,${ih})`)
                .selectAll('line').attr('stroke', 'var(--grey-100)');
            g.append('g')
                .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''))
                .selectAll('line').attr('stroke', 'var(--grey-100)');
            g.selectAll('.domain').remove();

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
                .attr('tabindex', 0)
                .attr('role', 'button')
                .attr('aria-label', (d, i) => {
                    const featureValue = formatValue(d[col]);
                    const labelValue = formatValue(d.label);
                    return `${col} value ${featureValue}, sales ${labelValue}, point ${i + 1}. Press Enter or Space to keep the details visible.`;
                })
                .on('mouseenter focus', function (event, d) {
                    const idx = +d3.select(this).attr('data-idx');
                    setHighlightedRow(idx, {...d, _idx: idx, column: col, key: `${col}-${idx}`});
                })
                .on('mouseleave blur', function () {
                    const idx = +d3.select(this).attr('data-idx');
                    clearHighlightedRow(idx, `${col}-${idx}`);
                })
                .on('keydown', function (event, d) {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    const idx = +d3.select(this).attr('data-idx');
                    setHighlightedRow(idx, {...d, _idx: idx, column: col, key: `${col}-${idx}`});
                });

            dots.attr('r', 0)
                .transition().duration(400).delay((_, i) => i * 2)
                .attr('r', 3);

            allDots.push(dots);

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

            g.append('g')
                .attr('transform', `translate(0,${ih})`)
                .call(d3.axisBottom(x).ticks(4))
                .selectAll('text').attr('font-size', 9).attr('font-family', 'var(--font-mono)');

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

            svg.append('text')
                .attr('x', gx + ml + iw / 2).attr('y', 14)
                .attr('text-anchor', 'middle').attr('font-size', 12)
                .attr('font-weight', 'bold').attr('fill', dotColours[ci])
                .attr('font-family', 'var(--font-mono)')
                .text(col);

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
            setActivePoint(null);
    }, [allRows, featureCols]);

    if (!allRows || allRows.length === 0 || !featureCols) return null;

    const hasCoefficients = coefficients != null && coefficients.length > 0;

    return (
        <div className="viz-card">
            <div className="viz-card-header">
                <span className="viz-card-title">Feature vs Sales</span>
                {hasCoefficients ? (
                    <span className="badge badge--lazy">WHY THESE COEFFICIENTS?</span>
                ) : (
                    <span className="badge badge--spark">EXPLORE THE DATA</span>
                )}
            </div>
            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', width: '100%', height: '180px'}} />
            </div>

            <div className="hover-detail" role="status" aria-live="polite" aria-atomic="true">
                {activePoint ? (
                    <>
                    {featureCols.filter(c => activePoint[c] != null).map(c => (
                        <span key={c} style={{marginRight: '12px'}}>
                            <strong>{c}:</strong> {formatValue(activePoint[c])}
                        </span>
                    ))}
                    <span><strong>sales:</strong> {formatValue(activePoint.label)}</span>
                    </>
                ) : (
                    <span>
                        Keyboard tip: tab to any dot, then press Enter or Space to keep the point details visible.
                        Hover still works for mouse users.
                    </span>
                )}
            </div>

            <div className="viz-card-footer">
                {hasCoefficients
                    ? 'Hover or focus a dot to compare feature values with the fitted coefficients. Strong linear pattern = large coefficient.'
                    : 'Hover or focus a dot to inspect the raw values across the plots. Which features have a strong linear relationship with sales?'}
            </div>
        </div>
    );
};

export default FeatureScatter;
