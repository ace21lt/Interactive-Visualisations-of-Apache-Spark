import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './Lab2Layout.css';
import { chartBlue, chartOrange, neutralSurface, neutralWhite } from '../../theme/palette';

const SplitPartitionDiagram = ({splitRows, trainCount, testCount, seed, featureCols}) => {
    const wrapRef = useRef();
    const svgRef = useRef();
    const width = useContainerWidth(wrapRef);
    const [hovered, setHovered] = useState(null);
    const hasSplitRows = Array.isArray(splitRows);
    const hasFeatureCols = Array.isArray(featureCols);

    useEffect(() => {
        if (!hasSplitRows || splitRows.length === 0) return;

        const W = width;
        const H = 300;
        const ml = 20, mr = 20, mt = 50, mb = 30;
        const IW = W - ml - mr;

        const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
        svg.selectAll('*').remove();

        const g = svg.append('g').attr('transform', `translate(${ml},${mt})`);

        // Driver node at top
        const dW = 200, dH = 34;
        const dX = (IW - dW) / 2;
        g.append('rect')
            .attr('x', dX).attr('y', -40)
            .attr('width', dW).attr('height', dH).attr('rx', 6)
            .attr('fill', chartBlue).attr('stroke', 'none');
        g.append('text')
            .attr('x', dX + dW / 2).attr('y', -40 + dH / 2 + 1)
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .attr('font-size', 12).attr('font-weight', 'bold')
            .attr('fill', neutralWhite).attr('font-family', 'var(--font-mono)')
            .text(`randomSplit(seed=${seed ?? 0})`);

        // Arrow from driver to partition
        g.append('line')
            .attr('x1', IW / 2).attr('y1', -6)
            .attr('x2', IW / 2).attr('y2', 10)
            .attr('stroke', 'var(--grey-400)').attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,3');

        // Partition box
        const boxY = 14;
        const boxH = H - mt - mb - boxY;
        const boxW = Math.min(IW * 0.7, 400);
        const boxX = (IW - boxW) / 2;

        g.append('rect')
            .attr('x', boxX).attr('y', boxY)
            .attr('width', boxW).attr('height', boxH).attr('rx', 6)
            .attr('fill', neutralSurface)
            .attr('stroke', 'var(--grey-300)').attr('stroke-width', 1.5);

        g.append('text')
            .attr('x', boxX + boxW / 2).attr('y', boxY + 16)
            .attr('text-anchor', 'middle').attr('font-size', 11)
            .attr('font-weight', 'bold').attr('fill', 'var(--grey-500)')
            .attr('font-family', 'var(--font-mono)')
            .text(`Partition 0 — all ${splitRows.length} rows`);

        // Lay out dots in a grid
        const n = splitRows.length;
        const dotArea = {x: boxX + 12, y: boxY + 28, w: boxW - 24, h: boxH - 40};
        const cols = Math.ceil(Math.sqrt(n * (dotArea.w / dotArea.h)));
        const rows = Math.ceil(n / cols);
        const dotR = Math.min(6, (dotArea.w / cols) * 0.4, (dotArea.h / rows) * 0.4);
        const gapX = dotArea.w / cols;
        const gapY = dotArea.h / rows;

        // Sort: train first, then test
        const sorted = [...splitRows].sort((a, b) => {
            if (a._split === b._split) return 0;
            return a._split === 'train' ? -1 : 1;
        });

        sorted.forEach((row, i) => {
            const col = i % cols;
            const r = Math.floor(i / cols);
            const cx = dotArea.x + col * gapX + gapX / 2;
            const cy = dotArea.y + r * gapY + gapY / 2;
            const isTrain = row._split === 'train';

            g.append('circle')
                .attr('cx', cx).attr('cy', cy)
                .attr('r', 0)
                .attr('fill', isTrain ? chartBlue : chartOrange)
                .attr('opacity', 0.75)
                .attr('stroke', 'none')
                .style('cursor', 'pointer')
                .on('mouseenter', function () {
                    d3.select(this).attr('r', dotR + 3).attr('opacity', 1)
                        .attr('stroke', neutralWhite).attr('stroke-width', 2);
                    setHovered(row);
                })
                .on('mouseleave', function () {
                    d3.select(this).attr('r', dotR).attr('opacity', 0.75)
                        .attr('stroke', 'none');
                    setHovered(null);
                })
                .transition().duration(300)
                .delay(i * 8)
                .attr('r', dotR);
        });

        // Boundary line between train and test dots
        const _trainCount = trainCount ?? sorted.filter(r => r._split === 'train').length;
        const boundaryRow = Math.floor(_trainCount / cols);
        if (boundaryRow > 0 && boundaryRow < rows) {
            const bY = dotArea.y + boundaryRow * gapY;
            g.append('line')
                .attr('x1', dotArea.x).attr('y1', bY)
                .attr('x2', dotArea.x + dotArea.w).attr('y2', bY)
                .attr('stroke', 'var(--grey-400)').attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,3')
                .attr('opacity', 0)
                .transition().duration(300).delay(n * 8 + 200)
                .attr('opacity', 0.5);
        }

        // "No shuffle" label
        g.append('text')
            .attr('x', boxX - 4).attr('y', boxY + boxH / 7)
            .attr('text-anchor', 'end').attr('font-size', 9)
            .attr('fill', chartOrange).attr('font-family', 'var(--font-mono)')
            .attr('transform', `rotate(-90, ${boxX - 4}, ${boxY + boxH / 7})`)
            .text('NO SHUFFLE — rows stay in place');

    }, [splitRows, trainCount, testCount, seed, width, hasSplitRows]);

    useEffect(() => {
        setHovered(null);
    }, [splitRows, featureCols]);

    if (splitRows != null && !Array.isArray(splitRows)) {
        throw new Error('SplitPartitionDiagram: "splitRows" must be an array when provided.');
    }

    if (hasSplitRows && splitRows.length === 0) {
        throw new Error('SplitPartitionDiagram: "splitRows" must be a non-empty array when provided.');
    }

    if (splitRows == null) return null;

    if (featureCols != null && !Array.isArray(featureCols)) {
        throw new Error('SplitPartitionDiagram: "featureCols" must be an array when provided.');
    }

    if (hasFeatureCols && featureCols.length === 0) {
        throw new Error('SplitPartitionDiagram: "featureCols" must be a non-empty array when provided.');
    }

    if (!hasFeatureCols) return null;

    const displayFeatureCols = featureCols;

    return (
        <div className="viz-card">
            <div className="viz-card-header">
                <span className="viz-card-title">Partition-Level Split</span>
                <span className="badge badge--blocked">NARROW TRANSFORMATION</span>
            </div>
            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', width: '100%', height: '300px'}}/>
            </div>

            {hovered ? (
                <div className="hover-detail" style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
                    <span className={`split-badge split-badge--${hovered._split}`}>
                        {hovered._split.toUpperCase()}
                    </span>
                    {displayFeatureCols.map(c => (
                        hovered[c] != null && (
                            <span key={c}>
                                <strong>{c}:</strong>{' '}
                                {typeof hovered[c] === 'number' ? hovered[c].toFixed(1) : hovered[c]}
                            </span>
                        )
                    ))}
                    {hovered.label != null && <span><strong>sales:</strong> {hovered.label.toFixed(1)}</span>}
                </div>
            ) : (
                <div className="legend-row" style={{padding: '6px 16px', borderTop: '1px solid var(--grey-200)'}}>
                    <span className="legend-item">
                        <span className="legend-item-dot" style={{background: chartBlue}}/>
                        Train ({trainCount ?? '?'})
                    </span>
                    <span className="legend-item">
                        <span className="legend-item-dot" style={{background: chartOrange}}/>
                        Test ({testCount ?? '?'})
                    </span>
                    <span style={{color: 'var(--grey-400)', fontSize: '11px'}}>
                        Hover any dot to see its values. Each row is independently hash-assigned.
                    </span>
                </div>
            )}
        </div>
    );
};

export default SplitPartitionDiagram;