import React, {useRef, useEffect, useState} from 'react';
import * as d3 from 'd3';

// Step routing
// Uses step index and JSON step flags only
function getPartitionsForStep(stepIndex, pipeline, internals) {
    if (!internals || !pipeline) return [];
    const step = pipeline[stepIndex - 1];
    if (!step) return [];

    // Step 1: gzip bottleneck — single partition
    if (stepIndex === 1)
        return [{partition_id: 0, row_count: step.output_rows ?? 1569898}];

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

    // Action step (count()), not a shuffle — filter has fired across partitions
    if (step.type === 'action' && !step.shuffle)
        return internals.filter_partition_distribution?.length
            ? internals.filter_partition_distribution
            : internals.partition_distribution ?? [];

    // All lazy transformations (filter, withColumn, repartition):
    // partition state is the balanced post-repartition distribution
    return internals.partition_distribution ?? [];
}

// Colour logic
// Reads from JSON step flags only. Uses partitions_after to detect repartition
// (which the JSON marks as lazy:true but visually belongs to the purple/wide category).
// Okabe-Ito colour-blind-safe palette
// Avoids red/green pairing — safe for deuteranopia and protanopia
function resolveStepColor(step, stepIndex) {
    if (stepIndex === 1) return '#D55E00'; // vermillion  — gzip bottleneck
    if (step.shuffle) return '#E69F00';    // orange      — shuffle / wide
    if (step.type === 'action') return '#0072B2'; // blue — action (count)
    if (step.partitions_after != null) return '#CC79A7'; // reddish purple — repartition
    return '#56B4E9';                       // sky blue   — lazy transformation
}

// Component
const PartitionDiagram = ({currentStep, data, highlightedPartition, onPartitionClick}) => {
    const svgRef = useRef();
    const wrapRef = useRef();
    const [dims, setDims] = useState({width: 600});
    const [selectedPartition, setSelectedPartition] = useState(null);

    // Responsive width via ResizeObserver
    useEffect(() => {
        if (!wrapRef.current) return;
        const ro = new ResizeObserver(e => setDims({width: e[0].contentRect.width}));
        ro.observe(wrapRef.current);
        return () => ro.disconnect();
    }, []);

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
        const GLOBAL_MAX = data.filter_results?.total ?? 1569898;
        const color = resolveStepColor(activeStep, currentStep);
        const isLazy = !!activeStep.lazy;
        const isShuffle = !!activeStep.shuffle;
        const isAction = activeStep.type === 'action';
        const isBottleneck = currentStep === 1;
        // Driver lights up when an action has fired (data returned) or repartition has moved data
        const driverActive = isAction || isShuffle;

        // Canvas
        const W = dims.width;
        const H = 390;
        const ml = 20, mr = 20, mt = 20, mb = 40;
        const IW = W - ml - mr;

        const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
        svg.selectAll('*').remove();

        // Arrow marker
        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id', 'sh-arrow').attr('viewBox', '0 0 8 8')
            .attr('refX', 4).attr('refY', 4)
            .attr('markerWidth', 5).attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,0 L0,8 L8,4 z').attr('fill', '#E69F00');

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
            .attr('fill', driverActive ? '#fff' : 'var(--grey-500)')
            .text('DRIVER NODE');

        // "result collected here" label — only when action fired
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
            .attr('stroke', 'var(--uos-yellow)').attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4');
        g.append('text')
            .attr('x', IW / 2).attr('y', netY - 6)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('font-family', 'var(--font-mono)').attr('fill', '#E69F00')
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
        // Cap to DIAGRAM_CAP — when groupby_col = "host" there can be 75k partitions
        // which makes the diagram unusable. We show the top DIAGRAM_CAP by row count
        // (the dist is already sorted desc) and display a banner explaining the cap.
        const n = Math.min(realN, DIAGRAM_CAP);
        const displayedPartitions = partitions.slice(0, n);
        const isCapped = realN > DIAGRAM_CAP;
        const realTotal = isShuffle
            ? (internals.partition_story?.post_shuffle_partitions ?? realN)
            : realN;

        const slotsN = isBottleneck ? (pipeline[1]?.partitions_after ?? 8) : n;
        const gap = slotsN === 1 ? 0 : 8;
        // Anchor box width to max(slotsN, 8) so boxes don't grow too wide for small counts
        const maxN = Math.max(slotsN, 8);
        const boxW = Math.min(68, (IW - gap * (maxN - 1)) / maxN);
        const pY = execLabelY + 14;
        const maxBarH = H - mt - mb - pY - 16;
        const sqrtScale = d3.scaleSqrt().domain([0, GLOBAL_MAX]).range([0, maxBarH - 16]);

        const groupW = slotsN * boxW + gap * (slotsN - 1);
        const startX = (IW - groupW) / 2;

        // Cap banner — shown when partition count exceeds DIAGRAM_CAP
        if (isCapped) {
            const bannerY = pY - 18;
            g.append('rect')
                .attr('x', 0).attr('y', bannerY - 12)
                .attr('width', IW).attr('height', 16)
                .attr('fill', '#fff7ed').attr('rx', 2);
            g.append('text')
                .attr('x', IW / 2).attr('y', bannerY)
                .attr('text-anchor', 'middle').attr('font-size', 9)
                .attr('font-family', 'var(--font-mono)').attr('fill', '#c2410c')
                .text(`Showing top ${n} of ${realTotal.toLocaleString()} partitions — diagram capped for readability`);
        }

        // Shuffle convergence arrows
        // Travel upward from partition zone → through boundary → toward driver
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
                    .attr('fill', 'none').attr('stroke', '#E69F00')
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
                .attr('fill', isHl ? '#fffbeb' : '#fafafa')
                .attr('stroke', isHl ? '#E69F00' : (isLazy ? 'var(--grey-300)' : color))
                .attr('stroke-width', isHl ? 2.5 : 1.5)
                .attr('stroke-dasharray', isLazy ? '4,4' : 'none')
                .attr('rx', 3)
                .style('cursor', onPartitionClick ? 'pointer' : 'default')
                .on('click', () => {
                    // Only open panel if this partition actually has data
                    if ((pData.row_count ?? 0) === 0) return;
                    const pid = pData.partition_id ?? i;
                    onPartitionClick?.(pid);
                    setSelectedPartition(prev => prev === pid ? null : pid);
                });

            // Animated fill bar (grows upward from bottom of box)
            if (barH > 0) {
                const barFill = isHl ? 'var(--uos-yellow)'
                    : (isBottleneck && i === 0 ? '#D55E00' : color);
                g.append('rect')
                    .attr('x', x).attr('y', pY + maxBarH)
                    .attr('width', boxW).attr('height', 0)
                    .attr('fill', barFill).attr('rx', 2)
                    .style('cursor', onPartitionClick ? 'pointer' : 'default')
                    .on('click', () => {
                        if ((pData.row_count ?? 0) === 0) return;
                        const pid = pData.partition_id ?? i;
                        onPartitionClick?.(pid);
                        setSelectedPartition(prev => prev === pid ? null : pid);
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
                    .attr('fill', isHl ? '#E69F00' : color)
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
                const dotFill = !evaluated ? '#888'
                    : passes ? '#16a34a'
                        : '#D55E00';
                const dotOp = evaluated && !passes ? 0.18 : 1;

                g.append('circle')
                    .attr('cx', cx).attr('cy', cy).attr('r', 4.5)
                    .attr('fill', dotFill)
                    .attr('stroke', '#fff').attr('stroke-width', 1)
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
            .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#666')
            .text(activeStep.description ?? '');

    }, [currentStep, data, highlightedPartition, dims, onPartitionClick]);

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
        <div style={{border: '1px solid var(--grey-300)', borderRadius: '6px', background: '#fff'}}>

            {/* ── Header ── */}
            <div style={{
                padding: '10px 16px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--grey-50)', borderBottom: '2px solid var(--uos-purple)'
            }}>
                <span style={{
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: 'var(--grey-900)',
                    fontFamily: 'var(--font-mono)'
                }}>
                    Cluster Execution
                </span>
                <span style={{
                    fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px',
                    background: `${color}22`, color, border: `1px solid ${color}`
                }}>
                    {badge}
                </span>
            </div>

            <div style={{
                padding: '6px 16px', display: 'flex', gap: '14px', flexWrap: 'wrap',
                alignItems: 'center', borderBottom: '1px solid var(--grey-200)',
                fontSize: '11px', color: '#666'
            }}>
                {[
                    {s: {width: 12, height: 12, background: '#D55E00', borderRadius: 2}, label: 'Bottleneck'},
                    {s: {width: 12, height: 12, background: '#CC79A7', borderRadius: 2}, label: 'Repartition'},
                    {
                        s: {
                            width: 12,
                            height: 12,
                            background: '#56B4E9',
                            borderRadius: 2,
                            border: '1px dashed #92400e'
                        },
                        label: 'Lazy'
                    },
                    {s: {width: 12, height: 12, background: '#0072B2', borderRadius: 2}, label: 'Action'},
                    {s: {width: 12, height: 12, background: '#E69F00', borderRadius: 2}, label: 'Shuffle'},
                    {s: {width: 8, height: 8, background: '#16a34a', borderRadius: '50%'}, label: 'Passes filter'},
                    {
                        s: {width: 8, height: 8, background: '#D55E00', borderRadius: '50%', opacity: 0.3},
                        label: 'Filtered out'
                    },
                ].map(({s, label}) => (
                    <span key={label} style={{display: 'flex', alignItems: 'center', gap: 5}}>
                        <span style={s}/>{label}
                    </span>
                ))}
            </div>

            {/* ── SVG ── */}
            <div ref={wrapRef} style={{width: '100%', padding: '10px 0'}}>
                <svg ref={svgRef} style={{display: 'block', overflow: 'visible', width: '100%', height: '390px'}}/>
            </div>


            {/*Partition data panel — appears when user clicks a partition bar */}
            {selectedPartition !== null && (() => {
                // Step-aware row selection — shows different data per pipeline stage
                const allTracked = data?.tracked_rows ?? [];
                const trackedEntry = allTracked.find(t => t.partition_id === selectedPartition);
                const trackedRows = trackedEntry?.rows ?? [];

                // Choose partition distribution based on current step
                const partDist = (() => {
                    if (currentStep === 4) return internals?.filter_partition_distribution ?? internals?.partition_distribution ?? [];
                    if (currentStep === 6 && pipeline?.slice(0, currentStep - 1).some(s => s.shuffle))
                        return internals?.daily_partition_distribution ?? internals?.post_shuffle_distribution ?? [];
                    if (currentStep === 6) return internals?.post_shuffle_distribution ?? [];
                    return internals?.partition_distribution ?? [];
                })();
                const partInfo = partDist.find(p => p.partition_id === selectedPartition);

                // What to show depends on the step
                const stepLabel = (() => {
                    if (currentStep === 1) return 'Raw gzip data (single partition holds everything)';
                    if (currentStep === 2) return 'After repartition — rows distributed round-robin';
                    if (currentStep === 3) return 'Filter predicate in DAG — same data as Step 2, not yet executed';
                    if (currentStep === 4) return 'After filter executed — only matching rows remain';
                    if (currentStep === 5) return 'After withColumn — rows now have host, status, day columns';
                    if (currentStep === 6) return `After repartitionByRange — partition owns rows with the same ${data?.spark_config?.groupby_key ?? 'key'} value`;
                    return '';
                })();

                // Steps 1-5: use tracked_rows; step 6: use grouped_tracked_rows from df_grouped
                const partRows = (() => {
                    if (currentStep === 6) {
                        const grouped = data?.grouped_tracked_rows ?? [];
                        return grouped.find(t => t.partition_id === selectedPartition)?.rows ?? [];
                    }
                    return currentStep <= 5 ? trackedRows : [];
                })();

                return (
                    <div style={{
                        margin: '0 16px 16px',
                        border: '1px solid var(--uos-purple)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        fontSize: '12px',
                    }}>
                        {/* Panel header */}
                        <div style={{
                            background: 'var(--uos-purple)', color: '#fff',
                            padding: '8px 14px', display: 'flex',
                            justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span style={{fontWeight: 'bold', fontFamily: 'var(--font-mono)'}}>
                                Partition {selectedPartition}
                                {partInfo ? ` — ${partInfo.row_count.toLocaleString()} rows` : ''}
                                {partRows.length > 0 ? ` · ${partRows.length} samples` : ''}
                            </span>
                            <span style={{fontSize: '11px', opacity: 0.85, fontWeight: 'normal', marginLeft: '8px'}}>
                                {stepLabel}
                            </span>
                            <button
                                onClick={() => {
                                    setSelectedPartition(null);
                                    onPartitionClick?.(null);
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    padding: '0 4px'
                                }}
                                aria-label="Close partition detail"
                            >✕
                            </button>
                        </div>

                        {partRows.length > 0 ? (
                            <div style={{padding: '12px 14px', background: '#fafafa'}}>

                                {/* Raw log lines */}
                                <div style={{
                                    fontWeight: 'bold',
                                    color: 'var(--grey-700)',
                                    marginBottom: '8px',
                                    fontSize: '12px'
                                }}>
                                    {currentStep === 3
                                        ? 'Rows in this partition (filter NOT yet executed — Step 4 will trigger it):'
                                        : currentStep === 4
                                            ? 'Rows in this partition BEFORE filter (Step 4 has now executed on these):'
                                            : currentStep === 5
                                                ? 'Rows in this partition (now have parsed host/status/day columns):'
                                                : currentStep === 6
                                                    ? `Sample rows — all share the same ${data?.spark_config?.groupby_key ?? 'key'} value:`
                                                    : 'Raw log entries in this partition:'}
                                </div>
                                <div style={{
                                    fontFamily: 'var(--font-mono)', fontSize: '11px',
                                    background: '#1e1e1e', color: '#d4d4d4',
                                    borderRadius: '4px', overflow: 'hidden',
                                    marginBottom: '14px'
                                }}>
                                    {partRows.map((row, i) => (
                                        <div key={i} style={{
                                            padding: '5px 10px',
                                            borderBottom: i < partRows.length - 1 ? '1px solid #333' : 'none',
                                            overflowX: 'auto', whiteSpace: 'nowrap'
                                        }}>
                                            {currentStep === 6
                                                ? `${row.host}  |  status: ${row.status}  |  day: ${row.day}`
                                                : row.raw_value}
                                        </div>
                                    ))}
                                </div>

                                {currentStep === 6 ? (
                                    <div style={{fontSize: '12px', color: 'var(--grey-600)', lineHeight: '1.6'}}>
                                        <div
                                            style={{fontWeight: 'bold', color: 'var(--grey-700)', marginBottom: '8px'}}>
                                            Aggregated result for this partition:
                                        </div>
                                        <div style={{
                                            fontFamily: 'var(--font-mono)',
                                            background: '#f5f3ff',
                                            border: '1px solid #ddd6fe',
                                            borderRadius: '4px',
                                            padding: '8px 12px',
                                            marginBottom: '10px'
                                        }}>
                                            {partRows[0] && (
                                                <span><strong>{data?.spark_config?.groupby_key ?? 'key'}:</strong> {partRows[0][data?.spark_config?.groupby_key ?? 'status']} &nbsp;|&nbsp;
                                                    <strong>total rows:</strong> {partInfo?.row_count?.toLocaleString() ?? '?'}</span>
                                            )}
                                        </div>
                                        <div style={{fontSize: '11px', color: 'var(--grey-500)'}}>
                                            Showing {partRows.length} sample rows from this partition. All rows in this
                                            partition share the
                                            same <code>{data?.spark_config?.groupby_key ?? 'key'}</code> value —
                                            repartitionByRange guaranteed this before groupBy ran.
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Filter result per row — the key pedagogical point */}
                                        <div style={{
                                            fontWeight: 'bold',
                                            color: 'var(--grey-700)',
                                            marginBottom: '8px',
                                            fontSize: '12px'
                                        }}>
                                            {currentStep === 3
                                                ? 'Predicted filter outcome (DAG recorded, not yet executed):'
                                                : currentStep === 4
                                                    ? 'Filter result — which rows survived:'
                                                    : 'Filter result (from Step 3/4) — same rows, now also have parsed columns in DataTable ↗:'}
                                        </div>
                                        <div style={{overflowX: 'auto', marginBottom: '12px'}}>
                                            <table
                                                style={{width: '100%', borderCollapse: 'collapse', fontSize: '11px'}}>
                                                <thead>
                                                <tr style={{background: '#e8e0f0'}}>
                                                    {['host', currentStep === 3 ? 'would pass filter?' : 'passes filter'].map(f => (
                                                        <th key={f} style={{
                                                            padding: '6px 10px',
                                                            textAlign: 'left',
                                                            borderBottom: '2px solid var(--uos-purple)',
                                                            fontFamily: 'var(--font-mono)',
                                                            fontWeight: 'bold',
                                                            color: 'var(--grey-800)',
                                                            whiteSpace: 'nowrap'
                                                        }}>{f}</th>
                                                    ))}
                                                </tr>
                                                </thead>
                                                <tbody>
                                                {partRows.map((row, i) => (
                                                    <tr key={i} style={{background: i % 2 === 0 ? '#fff' : '#f9f7fc'}}>
                                                        <td style={{
                                                            padding: '5px 10px',
                                                            fontFamily: 'var(--font-mono)',
                                                            borderBottom: '1px solid var(--grey-200)',
                                                            maxWidth: '220px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {row.host ?? '—'}
                                                        </td>
                                                        <td style={{
                                                            padding: '5px 10px',
                                                            borderBottom: '1px solid var(--grey-200)'
                                                        }}>
                                                            <span style={{
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: 'bold',
                                                                background: row.passes_japan_filter ? '#dcfce7' : '#fee2e2',
                                                                color: row.passes_japan_filter ? '#15803d' : '#b91c1c'
                                                            }}>
                                                                {currentStep === 3
                                                                    ? (row.passes_japan_filter ? '✓ would pass (DAG only)' : '✗ would be dropped (DAG only)')
                                                                    : (row.passes_japan_filter ? '✓ passed filter' : '✗ filtered out')}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div style={{fontSize: '11px', color: 'var(--grey-500)', lineHeight: '1.5'}}>
                                            Showing {partRows.length} of {partInfo?.row_count?.toLocaleString() ?? '?'} rows
                                            in this partition.
                                            {data?.spark_config?.filter_predicate === '.jp' && (
                                                <span style={{
                                                    display: 'block',
                                                    marginTop: '6px',
                                                    color: '#78350f',
                                                    background: '#fff8e1',
                                                    padding: '6px 8px',
                                                    borderRadius: '4px',
                                                    borderLeft: '3px solid #E69F00'
                                                }}>
                                                    <strong>Why does .contains("{data?.spark_config?.filter_predicate ?? '.jp'}") match some unexpected rows?</strong>{' '}
                                                    Spark&apos;s <code>.contains()</code> searches the <em>entire raw log line</em> as a flat string not just the host field.
                                                    This means a request for a <code>.jpeg</code> image (e.g. <code>livevideo.jpeg</code>) also matches <code>.jp</code> because &ldquo;jpeg&rdquo; contains &ldquo;jp&rdquo; as a substring.
                                                    This is the same behaviour as the Lab 1 code — <code>logFile.filter(logFile.value.contains(".jp"))</code> and is why Step 5&apos;s <code>regexp_extract</code> is needed to isolate just the host field for more precise filtering.
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div style={{padding: '12px 14px', color: 'var(--grey-500)', fontStyle: 'italic'}}>
                                No sample data available for this partition. Run the notebook first.
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

export default PartitionDiagram;