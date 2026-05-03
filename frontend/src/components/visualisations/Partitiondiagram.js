import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import PartitionDetailPanel from './PartitionDetailPanel';
import './Partitiondiagram.css';
import {
    okabeIto,
    neutralMuted,
    neutralSurface,
    neutralWhite,
    alpha,
    successFg,
    errorFg
} from '../../theme/palette';

// Step routing
function getPartitionsForStep(stepIndex, pipeline, internals) {
    if (!internals || !pipeline) return [];
    const step = pipeline[stepIndex - 1];
    if (!step) return [];

    // Step 1: gzip bottleneck — single partition
    if (stepIndex === 1)
        return [{partition_id: 0, row_count: step.output_rows ?? 0}];

    // Shuffle steps (groupBy): use post-shuffle distribution
    // Distinguish day vs status by checking which operation comes later in the pipeline
    if (step.shuffle) {
        const isDayStep = pipeline
            .slice(0, stepIndex - 1)
            .some(s => s.shuffle); // day is the second shuffle
        if (isDayStep && internals.daily_partition_distribution?.length)
            return internals.daily_partition_distribution;
        if (internals.post_shuffle_distribution?.length)
            return internals.post_shuffle_distribution;
        return internals.partition_distribution ?? [];
    }

    // Action step (count()), not a shuffle
    if (step.type === 'action' && !step.shuffle)
        return internals.filter_partition_distribution?.length
            ? internals.filter_partition_distribution
            : internals.partition_distribution ?? [];

    return internals.partition_distribution ?? [];
}

// Okabe-Ito colour-blind-safe palette
function resolveStepColor(step, stepIndex) {
    if (stepIndex === 1) return okabeIto.red; // vermillion  — gzip bottleneck
    if (step.shuffle) return okabeIto.orange;    // orange      — shuffle / wide
    if (step.type === 'action') return okabeIto.blue; // blue — action (count)
    if (step.partitions_after != null) return okabeIto.purple; // reddish purple — repartition
    return okabeIto.sky;             // sky blue   — lazy transformation
}

// Component
const PartitionDiagram = ({currentStep, data, highlightedPartition, onPartitionClick}) => {
    const svgRef = useRef();
    const wrapRef = useRef();
    const width = useContainerWidth(wrapRef, 600);
    const [selectedPartition, setSelectedPartition] = useState(null);

    // D3 draw
    useEffect(() => {
        const pipeline = data?.spark_internals?.transformation_pipeline;
        const internals = data?.spark_internals;
        if (!pipeline || !internals) return;

        const activeStep = pipeline[currentStep - 1];
        if (!activeStep) return;

        const partitions = getPartitionsForStep(currentStep, pipeline, internals);
        if (!partitions.length) return;

        const trackedRows = data.tracked_rows ?? [];
        const GLOBAL_MAX = data.filter_results?.total ?? 0;
        const color = resolveStepColor(activeStep, currentStep);
        const isLazy = !!activeStep.lazy;
        const isShuffle = !!activeStep.shuffle;
        const isAction = activeStep.type === 'action';
        const isBottleneck = currentStep === 1;
        // Driver lights up when an action has fired (data returned) or repartition has moved data
        const driverActive = isAction || isShuffle;

        // Canvas
        const W = width;
        const H = 390;
        const ml = 20, mr = 20, mt = 20, mb = 40;
        const IW = W - ml - mr;

        const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
        svg.selectAll('*').remove();
        const focusStroke = okabeIto.orange;
        const activatePartition = (pid) => {
            onPartitionClick?.(pid);
            setSelectedPartition(prev => prev === pid ? null : pid);
        };

        // Arrow marker
        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id', 'sh-arrow').attr('viewBox', '0 0 8 8')
            .attr('refX', 4).attr('refY', 4)
            .attr('markerWidth', 5).attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,0 L0,8 L8,4 z').attr('fill', okabeIto.orange);

        const g = svg.append('g').attr('transform', `translate(${ml},${mt})`);

        // Driver node
        const dW = 160, dH = 44, dX = (IW - dW) / 2;
        g.append('rect')
            .attr('x', dX).attr('y', 0)
            .attr('width', dW).attr('height', dH).attr('rx', 6)
            .attr('fill', driverActive ? color : 'var(--grey-100)')
            .attr('stroke', driverActive ? 'none' : 'var(--grey-300)')
            .attr('stroke-width', 2);
        g.append('text')
            .attr('x', dX + dW / 2).attr('y', 28)
            .attr('text-anchor', 'middle').attr('font-family', 'var(--font-mono)')
            .attr('font-size', 13).attr('font-weight', 'bold')
            .attr('fill', driverActive ? neutralWhite : 'var(--grey-500)')
            .text('DRIVER NODE');

        if (driverActive) {
            g.append('text')
                .attr('x', dX + dW / 2).attr('y', -6)
                .attr('text-anchor', 'middle').attr('font-size', 9)
                .attr('fill', color).attr('font-family', 'var(--font-mono)')
                .text('◄ result collected here');
        }

        // Network shuffle boundary
        const netY = dH + 30;
        g.append('line')
            .attr('x1', 0).attr('y1', netY).attr('x2', IW).attr('y2', netY)
            .attr('stroke', okabeIto.orange).attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4');
        g.append('text')
            .attr('x', IW / 2).attr('y', netY - 6)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('font-family', 'var(--font-mono)').attr('fill', okabeIto.orange)
            .text('NETWORK SHUFFLE BOUNDARY');

        // Executors label
        const execLabelY = netY + 14;
        g.append('text')
            .attr('x', 0).attr('y', execLabelY)
            .attr('font-size', 9).attr('font-family', 'var(--font-mono)')
            .attr('fill', 'var(--grey-400)')
            .text('EXECUTORS / WORKERS ▼');

        // Partition layout
        const DIAGRAM_CAP = 35;
        const realN = partitions.length;
        // Cap to DIAGRAM_CAP
        const n = Math.min(realN, DIAGRAM_CAP);
        const displayedPartitions = partitions.slice(0, n);
        const isCapped = realN > DIAGRAM_CAP;
        const realTotal = isShuffle
            ? (internals.partition_story?.post_shuffle_partitions ?? realN)
            : realN;

        const slotsN = isBottleneck ? (pipeline[1]?.partitions_after ?? n) : n;
        const gap = slotsN === 1 ? 0 : 8;
        // Anchor box width to max(slotsN, 8) so boxes don't grow too wide for small counts
        const maxN = Math.max(slotsN, 8);
        const boxW = Math.min(68, (IW - gap * (maxN - 1)) / maxN);
        const pY = execLabelY + 14;
        const maxBarH = H - mt - mb - pY - 16;
        const sqrtScale = d3.scaleSqrt()
            .domain([0, Math.max(GLOBAL_MAX, 1)])
            .range([0, maxBarH - 16]);

        const groupW = slotsN * boxW + gap * (slotsN - 1);
        const startX = (IW - groupW) / 2;

        // Cap banner — shown when partition count exceeds DIAGRAM_CAP
        if (isCapped) {
            const bannerY = pY - 18;
            g.append('rect')
                .attr('x', 0).attr('y', bannerY - 12)
                .attr('width', IW).attr('height', 16)
                .attr('fill', alpha(okabeIto.orange, 0.16)).attr('rx', 2);
            g.append('text')
                .attr('x', IW / 2).attr('y', bannerY)
                .attr('text-anchor', 'middle').attr('font-size', 9)
                .attr('font-family', 'var(--font-mono)').attr('fill', '#c2410c')
                .text(`Showing top ${n} of ${realTotal.toLocaleString()} partitions — diagram capped for readability`);
        }

        // Shuffle convergence arrows
        // Travel upward from partition zone  through boundary  toward driver
        if (isShuffle) {
            const prevParts = getPartitionsForStep(currentStep - 1, pipeline, internals);
            const ghostN = Math.max(prevParts.length, 1);
            const ghostGap = ghostN === 1 ? 0 : 8;
            const ghostBoxW = Math.min(68, (IW - ghostGap * (Math.max(ghostN, 8) - 1)) / Math.max(ghostN, 8));
            const ghostGrpW = ghostN * ghostBoxW + ghostGap * (ghostN - 1);
            const ghostX = (IW - ghostGrpW) / 2;
            const destX = startX + (n === 1 ? boxW / 2 : groupW / 2);
            const destY = netY - 4;

            for (let i = 0; i < ghostN; i++) {
                const srcX = ghostX + i * (ghostBoxW + ghostGap) + ghostBoxW / 2;
                g.append('path')
                    .attr('d', `M${srcX},${pY + 10} Q${(srcX + destX) / 2},${pY - 20} ${destX},${destY}`)
                    .attr('fill', 'none').attr('stroke', okabeIto.orange)
                    .attr('stroke-width', 1.5).attr('stroke-dasharray', '4,3')
                    .attr('marker-end', 'url(#sh-arrow)').attr('opacity', 0)
                    .transition().duration(500).delay(i * 55).attr('opacity', 0.6);
            }
        }

        // Draw partition slots
        for (let i = 0; i < slotsN; i++) {
            const x = startX + i * (boxW + gap);
            const pData = isBottleneck
                ? (i === 0 ? displayedPartitions[0] : {row_count: 0, partition_id: i})
                : (displayedPartitions[i] ?? {row_count: 0, partition_id: i});
            const rows = pData.row_count ?? 0;
            const barH = rows > 0 ? Math.max(sqrtScale(rows), 4) : 0;
            const barY = pY + maxBarH - barH;
            const isHl = highlightedPartition === (pData.partition_id ?? i);

            // Partition box outline
            g.append('rect')
                .attr('x', x).attr('y', pY)
                .attr('width', boxW).attr('height', maxBarH)
                .attr('fill', isHl ? alpha(okabeIto.orange, 0.18) : neutralSurface)
                .attr('stroke', isHl ? okabeIto.orange : (isLazy ? 'var(--grey-300)' : color))
                .attr('stroke-width', isHl ? 2.5 : 1.5)
                .attr('stroke-dasharray', isLazy ? '4,4' : 'none')
                .attr('rx', 3)
                .attr('tabindex', (onPartitionClick && (pData.row_count ?? 0) > 0) ? 0 : -1)
                .attr('role', (onPartitionClick && (pData.row_count ?? 0) > 0) ? 'button' : null)
                .attr('aria-label', (onPartitionClick && (pData.row_count ?? 0) > 0) ? `Partition ${pData.partition_id ?? i}, ${rows.toLocaleString()} rows. Press Enter or Space to inspect rows.` : null)
                .attr('aria-pressed', isHl ? 'true' : 'false')
                .style('cursor', onPartitionClick ? 'pointer' : 'default')
                .on('focus', function () {
                    if (!onPartitionClick || (pData.row_count ?? 0) === 0) return;
                    d3.select(this).attr('stroke', focusStroke).attr('stroke-width', 3);
                })
                .on('blur', function () {
                    d3.select(this).attr('stroke', isHl ? okabeIto.orange : (isLazy ? 'var(--grey-300)' : color)).attr('stroke-width', isHl ? 2.5 : 1.5);
                })
                .on('keydown', function (event) {
                    if (!onPartitionClick || (pData.row_count ?? 0) === 0 || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    activatePartition(pData.partition_id ?? i);
                })
                .on('click', () => {
                    // Only open panel if this partition actually has data
                    if ((pData.row_count ?? 0) === 0) return;
                    activatePartition(pData.partition_id ?? i);
                });

            // Animated fill bar (grows upward from bottom of box)
            if (barH > 0) {
                const barFill = isHl ? alpha(okabeIto.orange, 0.18)
                    : color;
                g.append('rect')
                    .attr('x', x).attr('y', pY + maxBarH)
                    .attr('width', boxW).attr('height', 0)
                    .attr('fill', barFill).attr('rx', 2)
                    .style('cursor', onPartitionClick ? 'pointer' : 'default')
                    .on('click', () => {
                        if ((pData.row_count ?? 0) === 0) return;
                        activatePartition(pData.partition_id ?? i);
                    })
                    .transition().duration(750).ease(d3.easeCubicOut)
                    .attr('y', barY).attr('height', barH);

                // Row count label inside / above bar
                const lbl = rows >= 1e6 ? `${(rows / 1e6).toFixed(2)}M`
                    : rows >= 1e3 ? `${(rows / 1e3).toFixed(0)}k`
                        : String(rows);
                const lblY = n === 1 ? pY + maxBarH * 0.45
                    : Math.max(barY - 5, pY + 11);
                g.append('text')
                    .attr('x', x + boxW / 2).attr('y', lblY)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'var(--font-mono)')
                    .attr('font-size', n === 1 ? 13 : 10).attr('font-weight', 'bold')
                    .attr('fill', isHl ? okabeIto.orange : color)
                    .attr('opacity', 0)
                    .transition().duration(650).delay(300).attr('opacity', 1)
                    .text(lbl);
            }

            // Partition ID below box
            g.append('text')
                .attr('x', x + boxW / 2).attr('y', pY + maxBarH + 14)
                .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#888')
                .text(`P${pData.partition_id ?? i}`);
        }

        // Tracked row dots
        // Rendered on steps 1–5 when tracked_rows are present.
        // Colour: grey = unevaluated; green = passes filter; red = filtered out (faded).
        if (currentStep <= 5 && trackedRows.length > 0 && slotsN === 8) {
            trackedRows.forEach(row => {
                const slotIdx = isBottleneck ? 0 : (row.partition_id ?? 0);
                if (slotIdx >= slotsN) return;
                const cx = startX + slotIdx * (boxW + gap) + boxW / 2;
                const cy = pY + maxBarH - 10;
                const evaluated = currentStep >= 4;
                const passes = row.passes_japan_filter;
                const dotFill = !evaluated ? neutralMuted
                    : passes ? successFg
                        : errorFg;
                const dotOp = evaluated && !passes ? 0.18 : 1;

                g.append('circle')
                    .attr('cx', cx).attr('cy', cy).attr('r', 4.5)
                    .attr('fill', dotFill)
                    .attr('stroke', neutralWhite).attr('stroke-width', 1)
                    .attr('opacity', 0)
                    .style('cursor', onPartitionClick ? 'pointer' : 'default')
                    .on('click', () => {
                        const pid = row.partition_id ?? slotIdx;
                        onPartitionClick?.(pid);
                        setSelectedPartition(prev => prev === pid ? null : pid);
                    })
                    .transition().duration(500)
                    .delay(evaluated ? 900 : 400)
                    .attr('opacity', dotOp);
            });
        }

        // Caption
        g.append('text')
            .attr('x', IW / 2).attr('y', H - mt - 2)
            .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', neutralMuted)
            .text(activeStep.description ?? '');

    }, [currentStep, data, highlightedPartition, width, onPartitionClick]);

    // Reset selection when step changes
    useEffect(() => {
        setSelectedPartition(null);
    }, [currentStep]);

    // Render guard
    const pipeline = data?.spark_internals?.transformation_pipeline;
    const internals = data?.spark_internals;
    if (!pipeline || !internals) return null;

    const activeStep = pipeline[currentStep - 1];
    if (!activeStep) return null;

    const color = resolveStepColor(activeStep, currentStep);
    const isLazy = !!activeStep.lazy;
    const isShuffle = !!activeStep.shuffle;


    const badge = isShuffle ? 'SHUFFLE'
        : isLazy ? 'LAZY'
            : 'ACTION';

    return (
        <div className="partition-diagram">

            {/*Header*/}
            <div className="partition-diagram-header">
                <span className="partition-diagram-title">
                    Cluster Execution
                </span>
                <span style={{
                    fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px',
                    background: alpha(color, 0.14), color, border: `1px solid ${color}`
                }}>
                    {badge}
                </span>
            </div>

            <div className="partition-diagram-legend">
                {[
                    {s: {width: 12, height: 12, background: okabeIto.red, borderRadius: 2}, label: 'Bottleneck'},
                    {s: {width: 12, height: 12, background: okabeIto.purple, borderRadius: 2}, label: 'Repartition'},
                    {
                        s: {
                            width: 12,
                            height: 12,
                            background: okabeIto.sky,
                            borderRadius: 2,
                            border: `1px dashed ${okabeIto.blue}`
                        },
                        label: 'Lazy'
                    },
                    {s: {width: 12, height: 12, background: okabeIto.blue, borderRadius: 2}, label: 'Action'},
                    {s: {width: 12, height: 12, background: okabeIto.orange, borderRadius: 2}, label: 'Shuffle'},
                    {s: {width: 8, height: 8, background: successFg, borderRadius: '50%'}, label: 'Passes filter'},
                    {
                        s: {width: 8, height: 8, background: errorFg, borderRadius: '50%'},
                        label: 'Filtered out'
                    },
                ].map(({s, label}) => (
                    <span key={label} className="partition-diagram-legend-item">
                        <span style={s}/>{label}
                    </span>
                ))}
            </div>

            {/*SVG*/}
            <div ref={wrapRef} className="partition-diagram-svg-wrap">
                <svg ref={svgRef} className="partition-diagram-svg"/>
            </div>


            {/*Partition data panel — appears when user clicks a partition bar */}
            <PartitionDetailPanel
                selectedPartition={selectedPartition}
                currentStep={currentStep}
                data={data}
                internals={internals}
                pipeline={pipeline}
                onClose={() => {
                    setSelectedPartition(null);
                    onPartitionClick?.(null);
                }}
            />
        </div>
    );
};

export default PartitionDiagram;