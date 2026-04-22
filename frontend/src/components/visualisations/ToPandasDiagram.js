import React, {useRef, useEffect} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';

// Visualises the .toPandas() boundary — the moment data leaves Spark's
// distributed partitions and converges to a single pandas DataFrame on the driver.
const ToPandasDiagram = ({trainCount, testCount, partitionDist}) => {
    const wrapRef = useRef();
    const svgRef = useRef();
    const width = useContainerWidth(wrapRef);
    const hasPartitionArray = Array.isArray(partitionDist);

    const partitionDataError = partitionDist != null && !Array.isArray(partitionDist)
        ? 'ToPandasDiagram: "partitionDist" must be an array when provided.'
        : hasPartitionArray
            ? partitionDist.length === 0
                ? 'ToPandasDiagram: "partitionDist" must be a non-empty array when provided.'
                : (() => {
                    const badIndex = partitionDist.findIndex(part => part?.row_count == null && part?.count == null);
                    return badIndex >= 0
                        ? `ToPandasDiagram: partitionDist[${badIndex}] must include "row_count" or "count".`
                        : null;
                })()
            : null;
    const hasPartitionData = hasPartitionArray && partitionDist.length > 0;

    useEffect(() => {
        const svg = d3.select(svgRef.current).attr('width', width).attr('height', 220);
        svg.selectAll('*').remove();
        if (partitionDataError || !hasPartitionData) return;

        const W = width;
        const H = 220;
        const ml = 20, mr = 20, mt = 20, mb = 20;
        const IW = W - ml - mr;

        // Arrow marker
        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id', 'topd-arrow').attr('viewBox', '0 0 8 8')
            .attr('refX', 4).attr('refY', 4)
            .attr('markerWidth', 5).attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,0 L8,4 L0,8 z').attr('fill', '#0072B2');

        const g = svg.append('g').attr('transform', `translate(${ml},${mt})`);


        const realParts = partitionDist.length;
        const nParts = realParts;
        const partW = Math.min(80, (IW - 16 * (nParts - 1)) / nParts);
        const partH = 50;
        const partGap = 16;
        const totalPartW = nParts * partW + (nParts - 1) * partGap;
        const partStartX = (IW - totalPartW) / 2;
        const partY = H - mt - mb - partH;

        for (let i = 0; i < nParts; i++) {
            const px = partStartX + i * (partW + partGap);
            // Accept either row_count (new spark_internals schema) or count (legacy)
            const part = partitionDist[i];
            const count = part.row_count ?? part.count;

            g.append('rect')
                .attr('x', px).attr('y', partY)
                .attr('width', partW).attr('height', partH).attr('rx', 4)
                .attr('fill', '#f0f8ff')
                .attr('stroke', '#0072B2')
                .attr('stroke-width', 1.5);

            g.append('text')
                .attr('x', px + partW / 2).attr('y', partY + 18)
                .attr('text-anchor', 'middle').attr('font-size', 10)
                .attr('font-weight', 'bold')
                .attr('fill', '#0072B2')
                .attr('font-family', 'var(--font-mono)')
                .text(`P${i}`);

            g.append('text')
                .attr('x', px + partW / 2).attr('y', partY + 34)
                .attr('text-anchor', 'middle').attr('font-size', 9)
                .attr('fill', 'var(--grey-500)')
                .attr('font-family', 'var(--font-mono)')
                .text(`${count} rows`);
        }

        // "Spark DataFrame" label
        g.append('text')
            .attr('x', IW / 2).attr('y', partY + partH + 14)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('fill', 'var(--grey-400)').attr('font-family', 'var(--font-mono)')
            .text('SPARK DATAFRAME (distributed)');

        // Top: Driver / pandas node
        const driverW = 220;
        const driverH = 44;
        const driverX = (IW - driverW) / 2;
        const driverY = 0;

        g.append('rect')
            .attr('x', driverX).attr('y', driverY)
            .attr('width', driverW).attr('height', driverH).attr('rx', 6)
            .attr('fill', '#D55E00').attr('stroke', 'none');

        g.append('text')
            .attr('x', driverX + driverW / 2).attr('y', driverY + 16)
            .attr('text-anchor', 'middle').attr('font-size', 12)
            .attr('font-weight', 'bold').attr('fill', '#fff')
            .attr('font-family', 'var(--font-mono)')
            .text('DRIVER NODE');

        g.append('text')
            .attr('x', driverX + driverW / 2).attr('y', driverY + 32)
            .attr('text-anchor', 'middle').attr('font-size', 10)
            .attr('fill', '#ffffffcc').attr('font-family', 'var(--font-mono)')
            .text(`pandas DataFrame · ${(trainCount ?? 0) + (testCount ?? 0)} rows`);

        // Convergence arrows: partitions -> driver
        const arrowTargetY = driverY + driverH + 4;
        const arrowSourceY = partY - 4;

        // Only animate arrows from real (data-holding) partitions, not idle ones.
        for (let i = 0; i < realParts; i++) {
            const srcX = partStartX + i * (partW + partGap) + partW / 2;
            const destX = driverX + driverW / 2;

            g.append('path')
                .attr('d', `M${srcX},${arrowSourceY} Q${(srcX + destX) / 2},${(arrowSourceY + arrowTargetY) / 2 - 20} ${destX},${arrowTargetY}`)
                .attr('fill', 'none').attr('stroke', '#0072B2')
                .attr('stroke-width', 2).attr('stroke-dasharray', '5,3')
                .attr('marker-end', 'url(#topd-arrow)')
                .attr('opacity', 0)
                .transition().duration(600).delay(200 + i * 150)
                .attr('opacity', 0.7);
        }

        // ".toPandas()" label on the boundary
        const midY = (arrowSourceY + arrowTargetY) / 2;
        g.append('line')
            .attr('x1', 0).attr('y1', midY)
            .attr('x2', IW).attr('y2', midY)
            .attr('stroke', '#E69F00').attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4');

        g.append('rect')
            .attr('x', IW / 2 - 52).attr('y', midY - 10)
            .attr('width', 104).attr('height', 20).attr('rx', 4)
            .attr('fill', '#fff').attr('stroke', '#E69F00').attr('stroke-width', 1);

        g.append('text')
            .attr('x', IW / 2).attr('y', midY + 4)
            .attr('text-anchor', 'middle').attr('font-size', 11)
            .attr('font-weight', 'bold').attr('fill', '#E69F00')
            .attr('font-family', 'var(--font-mono)')
            .text('.toPandas()');

    }, [trainCount, testCount, partitionDist, width, hasPartitionData, partitionDataError]);

    if (partitionDataError) {
        throw new Error(partitionDataError);
    }

    if (!hasPartitionData) {
        return null;
    }

    return (
        <div style={{border: '1px solid var(--grey-300)', borderRadius: '6px', background: '#fff'}}>
            <div style={{
                padding: '10px 16px', background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)'
            }}>
                <span style={{
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: 'var(--grey-900)',
                    fontFamily: 'var(--font-mono)'
                }}>
                    Distributed {'->'} Single-Node Boundary
                </span>
                <span style={{
                    fontSize: '10px', fontWeight: 'bold', marginLeft: '8px',
                    padding: '2px 6px', borderRadius: '4px',
                    background: '#fce4ec', color: '#880e4f', border: '1px solid #f8bbd0'
                }}>PARALLELISM ENDS HERE</span>
            </div>
            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', width: '100%', height: '220px'}}/>
            </div>
            <div style={{padding: '4px 16px 10px', fontSize: '11px', color: 'var(--grey-500)'}}>
                All partition data converges to the driver node via .toPandas(). With 200 rows this is trivial — for
                large datasets this would cause an OutOfMemoryError. scikit-learn then runs ML on this single machine.
            </div>
        </div>
    );
};

export default ToPandasDiagram;