import React, {useEffect, useRef, useState} from 'react';
import * as d3 from 'd3';
import useContainerWidth from '../../hooks/useContainerWidth';
import './Lab2ClusterView.css';
import {
    alpha,
    brandPurpleDark,
    chartBlue,
    chartBlueTint,
    chartGreen,
    chartOrange,
    chartPurple,
    chartPurpleTint,
    chartRed,
    chartSky,
    neutralSurface,
    neutralWhite,
} from '../../theme/palette';

// Okabe-Ito colour palette
const C_TRAIN = chartBlue;   // blue, train rows
const C_TEST = chartRed;   // vermillion, test rows
const C_LAZY = chartSky;   // sky blue, lazy Spark step
const C_SPARK = chartBlue;   // blue, executed Spark step
const C_COLLECT = chartRed;   // vermillion, .toPandas() driver
const C_SKLEARN = chartGreen;   // green, scikit-learn driver
const C_INACTIVE = 'var(--grey-300)';   // grey, idle slots


function resolveMode(stepObj) {
    if (!stepObj) return 'driver';
    if (stepObj.step === 1) return 'rdd';
    if (stepObj.spark_step && stepObj.step === 4) return 'split';
    if (stepObj.spark_step) return 'spark';
    if (stepObj.step === 5) return 'topandas';
    return 'driver';
}

// Card header badge per mode
function modeBadge(mode, isLazy) {
    if (mode === 'rdd') return {label: 'RDD: HPC only', bg: alpha(chartOrange, 0.14), col: chartOrange};
    if (mode === 'split') return {label: 'Narrow: no shuffle', bg: chartBlueTint, col: chartBlue};
    if (mode === 'topandas') return {label: 'Parallelism ends here', bg: chartPurpleTint, col: chartPurple};
    if (mode === 'driver') return {label: 'Driver: scikit-learn', bg: chartPurpleTint, col: chartPurple};
    // spark
    return isLazy
        ? {label: 'Spark distributed: lazy', bg: chartBlueTint, col: chartBlue}
        : {label: 'Spark distributed', bg: chartBlueTint, col: chartBlue};
}

// Layout constants shared across all modes 
const H = 290;   // SVG height (px)
const ML = 20;    // left margin
const MR = 20;    // right margin
const MT = 16;    // top margin
const MB = 30;    // bottom margin
const DW = 170;   // driver node width
const DH = 42;    // driver node height

const MIN_SLOTS = 4;

// D3 draw function 
function draw(svgEl, {
    width, mode, isLazy,
    partitionDist,         
    trainCount, testCount,
    stepIndex,
    selectedPartition,    
    onPartitionClick,     
    clickablePartition,     
    clickableTrain,        
    clickableTest,          
}) {
    const W = width;
    const IW = W - ML - MR;

    const svg = d3.select(svgEl).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();
    const focusStroke = brandPurpleDark;
    const activateSelection = (pid) => onPartitionClick?.(pid);
    const lazyFill = alpha(chartBlue, 0.22);
    const selectedFill = alpha(chartOrange, 0.26);
    const selectedStroke = brandPurpleDark;

    // Arrow marker (upward, for .toPandas convergence)
    const defs = svg.append('defs');
    defs.append('marker')
        .attr('id', 'cv-arrow').attr('viewBox', '0 0 8 8')
        .attr('refX', 4).attr('refY', 4)
        .attr('markerWidth', 5).attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,8 L4,0 L8,8 z')
        .attr('fill', C_COLLECT);

    const g = svg.append('g').attr('transform', `translate(${ML},${MT})`);

    // Driver node 
    const driverActive = (mode === 'topandas' || mode === 'driver');
    const driverCol = mode === 'driver' ? C_SKLEARN
        : mode === 'topandas' ? C_COLLECT
            : 'var(--grey-100)';
    const dX = (IW - DW) / 2;

    g.append('rect')
        .attr('x', dX).attr('y', 0)
        .attr('width', DW).attr('height', DH).attr('rx', 6)
        .attr('fill', driverActive ? driverCol : 'var(--grey-100)')
        .attr('stroke', driverActive ? 'none' : 'var(--grey-300)')
        .attr('stroke-width', 1.5);

    g.append('text')
        .attr('x', dX + DW / 2).attr('y', 17)
        .attr('text-anchor', 'middle').attr('font-family', 'var(--font-mono)')
        .attr('font-size', 11).attr('font-weight', 'bold')
        .attr('fill', driverActive ? neutralWhite : 'var(--grey-400)')
        .text('DRIVER NODE');

    // Driver sublabel
    const driverSub = mode === 'topandas'
        ? `pandas DataFrame · ${(trainCount ?? 0) + (testCount ?? 0)} rows`
        : mode === 'driver' ? 'scikit-learn, single machine'
            : mode === 'rdd' ? 'SparkContext (sc), HPC only'
                : 'no result yet (lazy)';

    g.append('text')
        .attr('x', dX + DW / 2).attr('y', 32)
        .attr('text-anchor', 'middle').attr('font-family', 'var(--font-mono)')
        .attr('font-size', 9)
        .attr('fill', driverActive ? alpha(neutralWhite, 0.8) : 'var(--grey-300)')
        .text(driverSub);

    // Network boundary 
    const netY = DH + 28;

    const boundaryCol = (mode === 'driver') ? 'var(--grey-200)'
        : (mode === 'topandas') ? C_COLLECT
            : chartOrange;

    g.append('line')
        .attr('x1', 0).attr('y1', netY)
        .attr('x2', IW).attr('y2', netY)
        .attr('stroke', boundaryCol).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '6,4');

    // Short labels 
    const boundaryLabel = mode === 'topandas' ? '.toPandas() '
        : mode === 'split' ? 'NO SHUFFLE'
            : mode === 'driver' ? 'PARALLELISM ENDED'
                : mode === 'rdd' ? 'EXECUTORS'
                    : 'NETWORK';

    g.append('text')
        .attr('x', IW / 2).attr('y', netY - 5)
        .attr('text-anchor', 'middle').attr('font-size', 8)
        .attr('font-family', 'var(--font-mono)')
        .attr('fill', mode === 'driver' ? 'var(--grey-300)' : boundaryCol)
        .attr('font-weight', 'bold')
        .text(boundaryLabel);

    // Executors label
    const execY = netY + 14;
    g.append('text')
        .attr('x', 0).attr('y', execY)
        .attr('font-size', 8).attr('font-family', 'var(--font-mono)')
        .attr('fill', mode === 'driver' ? 'var(--grey-200)' : 'var(--grey-400)')
        .text('EXECUTORS / WORKERS ▼');

    // Partition slot layout 
    const pY = execY + 12;
    const maxBarH = H - MT - MB - pY - 14;


    const realN = (partitionDist ?? []).length || 1;
    const slotsN = Math.max(realN, MIN_SLOTS);
    const gap = 8;
    const boxW = Math.min(72, (IW - gap * (slotsN - 1)) / slotsN);

    const groupW = slotsN * boxW + gap * (slotsN - 1);
    const startX = (IW - groupW) / 2;

    // Global max for bar scale
    const GLOBAL_MAX = Math.max(
        ...(partitionDist ?? []).map(p => p.row_count),
        (trainCount ?? 0) + (testCount ?? 0),
        1
    );
    const sqrtScale = d3.scaleSqrt()
        .domain([0, GLOBAL_MAX])
        .range([0, maxBarH - 12]);


    if (mode === 'split') {
        const totalRows = (trainCount ?? 0) + (testCount ?? 0);

        for (let i = 0; i < slotsN; i++) {
            const px = startX + i * (boxW + gap);
            const isReal = i === 0; 

            // Box outline
            g.append('rect')
                .attr('x', px).attr('y', pY)
                .attr('width', boxW).attr('height', maxBarH)
                .attr('fill', isReal ? lazyFill : neutralSurface)
                .attr('stroke', isReal ? C_SPARK : 'var(--grey-200)')
                .attr('stroke-width', 1.5).attr('rx', 3);

            if (isReal && totalRows > 0) {
                // Stacked train/test bar inside P0
                const trainFrac = (trainCount ?? 0) / totalRows;
                const fullBarH = maxBarH - 20;
                const trainH = Math.round(fullBarH * trainFrac);
                const testH = fullBarH - trainH;
                const barY = pY + 10;

                // Train segment (bottom)
                const isTrainSel = selectedPartition === 'train';
                const trainRect = g.append('rect')
                    .attr('x', px + 2).attr('y', barY + testH)
                    .attr('width', boxW - 4).attr('height', 0).attr('rx', 2)
                    .attr('fill', C_TRAIN)
                    .attr('stroke', isTrainSel ? selectedStroke : 'none')
                    .attr('stroke-width', isTrainSel ? 2.5 : 0)
                    .style('cursor', clickableTrain ? 'pointer' : 'default')
                    .attr('tabindex', clickableTrain ? 0 : -1)
                    .attr('role', clickableTrain ? 'button' : null)
                    .attr('aria-label', clickableTrain ? `Train segment, ${trainCount ?? '?'} rows. Press Enter or Space to inspect train rows.` : null)
                    .attr('aria-pressed', isTrainSel ? 'true' : 'false')
                    .on('click', () => {
                        if (clickableTrain) activateSelection('train');
                    })
                    .on('keydown', function (event) {
                        if (!clickableTrain || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        activateSelection('train');
                    })
                    .on('focus', function () {
                        if (!clickableTrain) return;
                        d3.select(this).attr('stroke', focusStroke).attr('stroke-width', 3);
                    })
                    .on('blur', function () {
                        d3.select(this).attr('stroke', isTrainSel ? selectedStroke : 'none').attr('stroke-width', isTrainSel ? 2.5 : 0);
                    });
                trainRect.transition().duration(500).ease(d3.easeCubicOut)
                    .attr('height', trainH);

                // Test segment (top)
                const isTestSel = selectedPartition === 'test';
                const testRect = g.append('rect')
                    .attr('x', px + 2).attr('y', barY)
                    .attr('width', boxW - 4).attr('height', 0).attr('rx', 2)
                    .attr('fill', C_TEST)
                    .attr('stroke', isTestSel ? selectedStroke : 'none')
                    .attr('stroke-width', isTestSel ? 2.5 : 0)
                    .style('cursor', clickableTest ? 'pointer' : 'default')
                    .attr('tabindex', clickableTest ? 0 : -1)
                    .attr('role', clickableTest ? 'button' : null)
                    .attr('aria-label', clickableTest ? `Test segment, ${testCount ?? '?'} rows. Press Enter or Space to inspect test rows.` : null)
                    .attr('aria-pressed', isTestSel ? 'true' : 'false')
                    .on('click', () => {
                        if (clickableTest) activateSelection('test');
                    })
                    .on('keydown', function (event) {
                        if (!clickableTest || (event.key !== 'Enter' && event.key !== ' ')) return;
                        event.preventDefault();
                        activateSelection('test');
                    })
                    .on('focus', function () {
                        if (!clickableTest) return;
                        d3.select(this).attr('stroke', focusStroke).attr('stroke-width', 3);
                    })
                    .on('blur', function () {
                        d3.select(this).attr('stroke', isTestSel ? selectedStroke : 'none').attr('stroke-width', isTestSel ? 2.5 : 0);
                    });
                testRect.transition().duration(500).ease(d3.easeCubicOut)
                    .attr('height', testH);

                // Row total label — inside train bar 
                g.append('text')
                    .attr('x', px + boxW / 2).attr('y', barY + testH + trainH / 2 + 3)
                    .attr('text-anchor', 'middle').attr('font-size', 9)
                    .attr('font-weight', 'bold')
                    .attr('fill', neutralWhite).attr('font-family', 'var(--font-mono)')
                    .text(`${totalRows} rows`);
            }

            // Partition ID label
            g.append('text')
                .attr('x', px + boxW / 2).attr('y', pY + maxBarH + 13)
                .attr('text-anchor', 'middle').attr('font-size', 9)
                .attr('fill', isReal ? 'var(--grey-400)' : 'var(--grey-200)')
                .attr('font-family', 'var(--font-mono)')
                .text(`P${i}`);
        }

        const p0X = startX;
        g.append('text')
            .attr('x', p0X + boxW / 2).attr('y', pY - 5)
            .attr('text-anchor', 'middle').attr('font-size', 8)
            .attr('fill', C_SPARK).attr('font-family', 'var(--font-mono)').attr('font-weight', 'bold')
            .text('P0: all rows');

        // Train / Test count labels below P0
        g.append('text')
            .attr('x', p0X + boxW / 2).attr('y', pY + maxBarH + 26)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('fill', C_TRAIN).attr('font-family', 'var(--font-mono)').attr('font-weight', 'bold')
            .text(`train: ${trainCount ?? '?'}`);
        g.append('text')
            .attr('x', p0X + boxW / 2).attr('y', pY + maxBarH + 38)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('fill', C_TEST).attr('font-family', 'var(--font-mono)').attr('font-weight', 'bold')
            .text(`test: ${testCount ?? '?'}`);

        // Idle slots banner
        const idleCount = slotsN - 1;
        g.append('text')
            .attr('x', startX + (slotsN * boxW + (slotsN - 1) * gap) / 2 + boxW)
            .attr('y', pY + maxBarH / 2)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('fill', 'var(--grey-300)').attr('font-family', 'var(--font-mono)')
            .text(`${idleCount} idle`);

        return;
    }

    // All other modes: draw N partition slots 
    for (let i = 0; i < slotsN; i++) {
        const px = startX + i * (boxW + gap);
        const pData = (partitionDist ?? [])[i] ?? {partition_id: i, row_count: 0};
        const rows = pData.row_count ?? 0;
        const isReal = i < realN;

        // Determine box appearance
        const isDimmed = mode === 'driver' || mode === 'rdd';
        const isLazyBox = mode === 'spark' && isLazy;
        const barCol = isDimmed ? C_INACTIVE
            : isLazyBox ? C_LAZY
                : C_SPARK;
        const boxStroke = isDimmed ? 'var(--grey-200)'
            : isLazyBox ? C_LAZY
                : isReal ? C_SPARK : 'var(--grey-200)';

        // Box outline 
        const isClickable = clickablePartition && stepIndex === 2 && i === 0 && isReal;
        const isSelected = isClickable && selectedPartition === 0;
        g.append('rect')
            .attr('x', px).attr('y', pY)
            .attr('width', boxW).attr('height', maxBarH)
            .attr('fill', isSelected ? selectedFill
                : isLazyBox ? lazyFill
                : isDimmed ? neutralSurface
                    : isReal ? chartBlueTint : neutralSurface)
            .attr('stroke', isSelected ? selectedStroke : boxStroke)
            .attr('stroke-width', isSelected ? 2.5 : 1.5)
            .attr('stroke-dasharray', isLazyBox ? '4,4' : 'none')
            .attr('rx', 3)
            .attr('tabindex', isClickable ? 0 : -1)
            .attr('role', isClickable ? 'button' : null)
            .attr('aria-label', isClickable ? `Partition ${pData.partition_id ?? i}, ${rows.toLocaleString()} rows. Press Enter or Space to inspect rows.` : null)
            .attr('aria-pressed', isSelected ? 'true' : 'false')
            .style('cursor', isClickable ? 'pointer' : 'default')
            .on('focus', function () {
                if (!isClickable) return;
                d3.select(this).attr('stroke', focusStroke).attr('stroke-width', 3);
            })
            .on('blur', function () {
                d3.select(this).attr('stroke', isSelected ? selectedStroke : boxStroke).attr('stroke-width', isSelected ? 2.5 : 1.5);
            })
            .on('keydown', function (event) {
                if (!isClickable || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                activateSelection(0);
            })
            .on('click', () => {
                if (isClickable) activateSelection(0);
            });

        if (rows > 0 && !isDimmed) {
            const barH = Math.max(sqrtScale(rows), 4);
            const barY = pY + maxBarH - barH;
            const barRect = g.append('rect')
                .attr('x', px).attr('y', pY + maxBarH).attr('width', boxW).attr('height', 0)
                .attr('fill', isSelected ? 'var(--uos-yellow)' : barCol).attr('rx', 2)
                .style('cursor', isClickable ? 'pointer' : 'default')
                .attr('tabindex', -1)
                .on('click', () => {
                    if (isClickable) activateSelection(0);
                });
            barRect.transition().duration(600).ease(d3.easeCubicOut)
                .attr('y', barY).attr('height', barH);

            // Row count label
            const lbl = rows >= 1000 ? `${(rows / 1000).toFixed(0)}k` : String(rows);
            g.append('text')
                .attr('x', px + boxW / 2).attr('y', Math.max(barY - 4, pY + 12))
                .attr('text-anchor', 'middle')
                .attr('font-family', 'var(--font-mono)')
                .attr('font-size', 10).attr('font-weight', 'bold')
                .attr('fill', barCol).attr('opacity', 0)
                .transition().duration(400).delay(500).attr('opacity', 1)
                .text(lbl);
        }

        // For .toPandas step: shade the real partition blue even before arrows
        if (mode === 'topandas' && isReal && rows > 0) {
            const barH = Math.max(sqrtScale(rows), 4);
            const barY = pY + maxBarH - barH;
            g.append('rect')
                .attr('x', px).attr('y', pY + maxBarH).attr('width', boxW).attr('height', 0)
                .attr('fill', C_SPARK).attr('rx', 2)
                .transition().duration(500).ease(d3.easeCubicOut)
                .attr('y', barY).attr('height', barH);
            const lbl = rows >= 1000 ? `${(rows / 1000).toFixed(0)}k` : String(rows);
            g.append('text')
                .attr('x', px + boxW / 2).attr('y', Math.max(barY - 4, pY + 12))
                .attr('text-anchor', 'middle')
                .attr('font-family', 'var(--font-mono)')
                .attr('font-size', 10).attr('font-weight', 'bold')
                .attr('fill', C_SPARK).attr('opacity', 0)
                .transition().duration(300).delay(400).attr('opacity', 1)
                .text(lbl);
        }

        // Partition ID label below box
        g.append('text')
            .attr('x', px + boxW / 2).attr('y', pY + maxBarH + 13)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('fill', isDimmed ? 'var(--grey-200)' : 'var(--grey-400)')
            .attr('font-family', 'var(--font-mono)')
            .text(`P${i}`);

    }

    // Idle slots banner 
    if ((mode === 'spark') && slotsN > realN) {
        const idleCount = slotsN - realN;
        const bannerY = pY + maxBarH + 26;
        g.append('text')
            .attr('x', IW / 2).attr('y', bannerY)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('font-family', 'var(--font-mono)')
            .attr('fill', chartOrange)
            .text(`${idleCount} idle slot${idleCount > 1 ? 's' : ''}, file too small to split across partitions`);
    }

    // .toPandas() convergence arrows 
    if (mode === 'topandas') {
        const arrowSrcY = pY - 4;
        const arrowDestY = DH + 6;
        const destX = dX + DW / 2;

        for (let i = 0; i < Math.max(realN, 1); i++) {
            const srcX = startX + i * (boxW + gap) + boxW / 2;
            g.append('path')
                .attr('d', `M${srcX},${arrowSrcY} Q${(srcX + destX) / 2},${(arrowSrcY + arrowDestY) / 2 - 20} ${destX},${arrowDestY}`)
                .attr('fill', 'none')
                .attr('stroke', C_COLLECT)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,3')
                .attr('marker-end', 'url(#cv-arrow)')
                .attr('opacity', 0)
                .transition().duration(600).delay(300 + i * 180)
                .attr('opacity', 0.8);
        }
    }

    // RDD: annotation that SparkContext is not available 
    if (mode === 'rdd') {
        const annotY = pY + maxBarH / 2;
        g.append('text')
            .attr('x', IW / 2).attr('y', annotY - 8)
            .attr('text-anchor', 'middle').attr('font-size', 11)
            .attr('font-weight', 'bold').attr('fill', 'var(--grey-300)')
            .attr('font-family', 'var(--font-mono)')
            .text('sc.parallelize(): RDDs would run here');
        g.append('text')
            .attr('x', IW / 2).attr('y', annotY + 10)
            .attr('text-anchor', 'middle').attr('font-size', 9)
            .attr('fill', 'var(--grey-300)').attr('font-family', 'var(--font-mono)')
            .text('SparkContext blocked on Databricks Serverless');
    }

    // Driver: "parallelism ended" annotation 
    if (mode === 'driver') {
        const annotY = pY + maxBarH / 2;
        g.append('text')
            .attr('x', IW / 2).attr('y', annotY)
            .attr('text-anchor', 'middle').attr('font-size', 10)
            .attr('fill', 'var(--grey-300)').attr('font-family', 'var(--font-mono)')
            .text('partitions inactive, data collected to driver at Step 5');
    }
}

// Component 
const Lab2ClusterView = ({currentStep, data, sampleRows, trainSample, testSample}) => {
    const svgRef = useRef();
    const wrapRef = useRef();
    const width = useContainerWidth(wrapRef, 560);
   
    const [selectedPartition, setSelectedPartition] = useState(null);
    useEffect(() => {
        setSelectedPartition(null);
    }, [currentStep]);

    // Pull everything from the trace
    const si = data?.spark_internals;
    const pipeline = si?.transformation_pipeline;
    const stepObj = pipeline?.[currentStep - 1];
    const mode = resolveMode(stepObj);
    const isLazy = !!stepObj?.lazy;

    const partitionDist = si?.partition_distribution ?? [];
    const trainCount = data?.train_test_split?.train_count;
    const testCount = data?.train_test_split?.test_count;

    // Redraw whenever step, data, or width changes
    useEffect(() => {
        if (!svgRef.current || !si) return;
        const clickablePartition = (mode === 'spark' && currentStep === 2 && (sampleRows?.length ?? 0) > 0);
        const clickableTrain = (mode === 'split' && (trainSample?.length ?? 0) > 0);
        const clickableTest = (mode === 'split' && (testSample?.length ?? 0) > 0);

        draw(svgRef.current, {
            width,
            mode,
            isLazy,
            partitionDist,
            trainCount,
            testCount,
            stepIndex: currentStep,
            selectedPartition,
            onPartitionClick: (pid) => {
                setSelectedPartition(prev => prev === pid ? null : pid);
            },
            clickablePartition,
            clickableTrain,
            clickableTest,
        });
    }, [currentStep, data, width, sampleRows, trainSample, testSample, selectedPartition]);

    if (!si) return null;

    const badge = modeBadge(mode, isLazy);

    // Contextual annotation below the diagram 
    const totalRows = si?.partition_story?.total_rows ?? '?';
    const realNAnn = partitionDist.length || 1;
    const idleN = Math.max(MIN_SLOTS - realNAnn, 0);

    const annotation = (() => {
        if (mode === 'rdd')
            return 'On HPC, sc.parallelize() distributes a Python list across executor slots as an RDD. On Databricks Serverless the SparkContext is unavailable, use DataFrames instead.';
        if (mode === 'spark' && currentStep === 2)
            return `The CSV (${totalRows} rows) landed in ${realNAnn} partition${realNAnn === 1 ? '' : 's'}. ${idleN} executor slot${idleN === 1 ? '' : 's'} idle. A larger file would automatically fill more slots.`;
        if (mode === 'spark' && currentStep === 3)
            return 'df.select() is a narrow transformation: it adds a projection to the DAG without executing anything. The partition layout is unchanged. Dashed borders indicate the operation is lazy.';
        if (mode === 'split')
            return 'randomSplit([0.6, 0.4]) is a narrow transformation: each executor independently hash-assigns its rows into train/test buckets. No data crosses the network. Both splits stay in Partition 0.';
        if (mode === 'topandas')
            return '.toPandas() serialises all partitions and sends them to the driver in a single collect operation. With 200 rows this is trivial. On a large dataset this would cause an OutOfMemoryError, this is why spark.ml is normally used instead.';
        if (mode === 'driver' && currentStep === 6)
            return 'Predictions are computed on the driver using the trained scikit-learn model. No Spark executors are involved, this is ordinary single-machine Python.';
        if (mode === 'driver' && currentStep === 7)
            return 'The ML Pipeline runs on the driver. On HPC, spark.ml Pipeline distributes tokenisation and hashing across executors, while this version runs equivalent scikit-learn stages locally.';
        return '';
    })();

    return (
        <div className="lab2-cluster-view">

            {/*Card header*/}
            <div className="lab2-cluster-view-header">
                <span className="lab2-cluster-view-title">
                    Cluster Execution
                </span>
                <span style={{
                    fontSize: '10px', fontWeight: 'bold',
                    padding: '2px 7px', borderRadius: '4px',
                    background: badge.bg, color: badge.col,
                    border: `1px solid ${badge.col}22`
                }}>
                    {badge.label}
                </span>
            </div>

            <div className="lab2-cluster-view-legend">
                {(() => {
                    // Build the legend items pool, then filter by mode
                    const all = {
                        sparkActive: {
                            s: {width: 10, height: 10, background: C_SPARK, borderRadius: 2},
                            label: 'Spark active'
                        },
                        lazy: {
                            s: {
                                width: 10,
                                height: 10,
                                background: C_LAZY,
                                borderRadius: 2,
                                border: `1px dashed ${chartBlue}`
                            }, label: 'Lazy (no exec)'
                        },
                        idle: {s: {width: 10, height: 10, background: C_INACTIVE, borderRadius: 2}, label: 'Idle'},
                        train: {
                            s: {width: 10, height: 10, background: C_TRAIN, borderRadius: '50%'},
                            label: `Train (${trainCount ?? '?'})`
                        },
                        test: {
                            s: {width: 10, height: 10, background: C_TEST, borderRadius: '50%'},
                            label: `Test (${testCount ?? '?'})`
                        },
                        collect: {
                            s: {width: 10, height: 10, background: C_COLLECT, borderRadius: 2},
                            label: '.toPandas()'
                        },
                        sklearn: {
                            s: {width: 10, height: 10, background: C_SKLEARN, borderRadius: 2},
                            label: 'scikit-learn'
                        },
                    };
                    // Choose which items are relevant for the current mode
                    const keysByMode = {
                        rdd: ['idle'],
                        spark: isLazy ? ['lazy', 'idle'] : ['sparkActive', 'idle'],
                        split: ['train', 'test', 'idle'],
                        topandas: ['sparkActive', 'collect', 'idle'],
                        driver: ['sklearn', 'idle'],
                    };
                    const keys = keysByMode[mode] ?? ['sparkActive'];
                    return keys.map(k => all[k]);
                })().map(({s, label}) => (
                    <span key={label} className="lab2-cluster-view-legend-item">
                        <span style={s}/>
                        {label}
                    </span>
                ))}
            </div>

            {/*SVG*/}
            <div ref={wrapRef} className="lab2-cluster-view-svg-wrap">
                <svg
                    ref={svgRef}
                    className="lab2-cluster-view-svg"
                    style={{height: `${H}px`}}
                />
            </div>

            {/*Step annotation*/}
            {annotation && (
                <div className="lab2-cluster-view-annotation">
                    {annotation}
                </div>
            )}

            {/*Partition data panel */}
            {selectedPartition !== null && (() => {
                const isStep2 = (stepObj?.step === 2) && selectedPartition === 0;
                const isTrain = selectedPartition === 'train';
                const isTest = selectedPartition === 'test';

                let partRows = [];
                let partLabel = '';
                let stepLabel = '';
                let columns = [];

                if (isStep2) {
                    partRows = sampleRows ?? [];
                    partLabel = `Partition 0: ${partitionDist?.[0]?.row_count ?? '?'} rows, ${Math.min(partRows.length, 5)} samples`;
                    stepLabel = 'Raw CSV data (single partition holds all rows)';
                    columns = partRows[0] ? Object.keys(partRows[0]) : [];
                } else if (isTrain) {
                    partRows = trainSample ?? [];
                    partLabel = `Partition 0 train: ${trainCount ?? '?'} rows, ${Math.min(partRows.length, 5)} samples`;
                    stepLabel = 'randomSplit assigned these rows to TRAIN (within P0)';
                    columns = partRows[0] ? Object.keys(partRows[0]) : [];
                } else if (isTest) {
                    partRows = testSample ?? [];
                    partLabel = `Partition 0 test: ${testCount ?? '?'} rows, ${Math.min(partRows.length, 5)} samples`;
                    stepLabel = 'randomSplit assigned these rows to TEST (within P0)';
                    columns = partRows[0] ? Object.keys(partRows[0]) : [];
                }

                partRows = partRows.slice(0, 5);

                return (
                    <div className="lab2-cluster-view-panel">
                        <div className="lab2-cluster-view-panel-header">
                            <span className="lab2-cluster-view-panel-title">
                                {partLabel}
                            </span>
                            <span className="lab2-cluster-view-panel-subtitle">
                                {stepLabel}
                            </span>
                            <button
                                onClick={() => setSelectedPartition(null)}
                                className="lab2-cluster-view-panel-close"
                                aria-label="Close partition detail"
                            >✕
                            </button>
                        </div>

                        {partRows.length > 0 && (
                            <div className="lab2-cluster-view-panel-body">
                                <div className="lab2-cluster-view-panel-copy-title">
                                    {isStep2
                                        ? 'First 5 rows loaded into this partition:'
                                        : isTrain
                                            ? 'First 5 TRAIN rows from this partition:'
                                            : 'First 5 TEST rows from this partition:'}
                                </div>

                                <div className="lab2-cluster-view-terminal">
                                    {partRows.map((row, i) => {
                                        // Render each row as a pipe-separated line
                                        const line = columns.map(k => {
                                            const v = row[k];
                                            if (v == null) return `${k}=-`;
                                            if (typeof v === 'number')
                                                return `${k}=${Number.isInteger(v) ? v : v.toFixed(2)}`;
                                            return `${k}=${v}`;
                                        }).join('  |  ');
                                        return (
                                            <div key={i} className="lab2-cluster-view-terminal-line" style={{borderBottom: i < partRows.length - 1 ? '1px solid var(--grey-700)' : 'none'}}>
                                                {line}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

export default Lab2ClusterView;