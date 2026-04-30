import React, {useState, useEffect, useRef, useMemo} from 'react';
import useContainerWidth from '../../hooks/useContainerWidth';
import { chartBlue, chartBlueTint, chartOrange, chartGreen, chartPurple, successBg, successFg, neutralWhite, neutralSurface, alpha } from '../../theme/palette';

//Configuration
const DOTS_PER_PART = 100;     // dots per partition
const TICK_MS = 28;      // ms per animation frame
const DOTS_PER_TICK = 1;       // dots added per partition per tick

// Okabe-Ito colours
const C_IN = chartBlue;    // inside arc  — blue (train colour)
const C_OUT = chartOrange;    // outside arc — vermillion
const C_DONE = chartGreen;    // driver active — green (scikit-learn colour)
const C_PART = [chartBlue, chartOrange, chartGreen, chartPurple]; // per-partition

//LCG PRNG — reproducible dot placement with seed
function makeLCG(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967295;
    };
}

//Quarter-circle arc path (SVG) 
// Fills the region x²+y²≤1 inside a square of side SQ.
// SVG coords: x runs right, y runs DOWN, so y is flipped from math coords.
// Arc: from (SQ, 0) counterclockwise to (0, SQ) with radius SQ.
function arcPath(SQ) {
    return `M ${SQ} 0 A ${SQ} ${SQ} 0 0 0 0 ${SQ} L 0 0 Z`;
}

const PiEstimationDiagram = ({piData, partitionCount}) => {
    const wrapRef = useRef();
    const timerRef = useRef(null);
    const rngRef = useRef(null);

    const containerWidth = useContainerWidth(wrapRef, 520);
    const [dots, setDots] = useState([]);   // [{x, y, p, inside}]
    const [phase, setPhase] = useState('idle'); 

    const nPartitions = useMemo(() => {
        if (!piData) return null;

        const candidates = [
            piData?.num_partitions,
            piData?.partition_count,
            piData?.partitions,
            partitionCount,
        ];

        let sawCandidate = false;
        for (const value of candidates) {
            if (value === undefined) continue;
            sawCandidate = true;
            const parsed = Number(value);
            if (Number.isInteger(parsed) && parsed > 0) return parsed;
            throw new Error('PiEstimationDiagram: partition count must be a positive integer.');
        }

        if (!sawCandidate) {
            throw new Error('PiEstimationDiagram: partition count is required (expected piData.num_partitions or equivalent).');
        }

        throw new Error('PiEstimationDiagram: partition count must be a positive integer.');
    }, [piData, partitionCount]);


    // Auto-start once piData arrives
    useEffect(() => {
        if (piData && nPartitions && phase === 'idle') startAnimation();
    }, [piData, nPartitions, phase]);

    // Cleanup on unmount
    useEffect(() => () => clearInterval(timerRef.current), []);

    const startAnimation = () => {
        clearInterval(timerRef.current);
        setDots([]);
        setPhase('running');
        rngRef.current = makeLCG(Math.floor(Math.random() * 0xFFFFFFFF));
    };

    // Animation ticker
    useEffect(() => {
        if (phase !== 'running') return;
        if (!nPartitions) return;

        const rng = rngRef.current;
        const totalTarget = nPartitions * DOTS_PER_PART;
        let count = 0;

        timerRef.current = setInterval(() => {
            const batch = [];
            for (let p = 0; p < nPartitions; p++) {
                for (let b = 0; b < DOTS_PER_TICK; b++) {
                    if (count >= totalTarget) break;
                    const x = rng(), y = rng();
                    batch.push({x, y, p, inside: x * x + y * y <= 1});
                    count++;
                }
            }

            setDots(prev => [...prev, ...batch]);

            if (count >= totalTarget) {
                clearInterval(timerRef.current);
                setPhase('done');
            }
        }, TICK_MS);

        return () => clearInterval(timerRef.current);
    }, [phase, nPartitions]);

    //Derived stats 
    const {total, hits, animEst, perPart, dotsByPartition} = useMemo(() => {
        if (!nPartitions) {
            return {total: 0, hits: 0, animEst: null, perPart: [], dotsByPartition: []};
        }

        const pp = Array.from({length: nPartitions}, () => ({total: 0, hits: 0}));
        const dp = Array.from({length: nPartitions}, () => []);
        let h = 0;
        for (const d of dots) {
            pp[d.p].total++;
            dp[d.p].push(d);
            if (d.inside) {
                pp[d.p].hits++;
                h++;
            }
        }
        const tot = dots.length;
        return {
            total: tot,
            hits: h,
            animEst: tot > 0 ? 4 * h / tot : null,
            perPart: pp.map(e => ({
                ...e,
                localEst: e.total > 0 ? 4 * e.hits / e.total : null
            })),
            dotsByPartition: dp,
        };
    }, [dots, nPartitions]);

    // Layout geometry (wrap partitions into rows of up to 8)
    const PAD = 16;
    const H_GAP = 12;
    const V_GAP = 20;
    const MAX_COLS = 8;
    const cols = Math.min(MAX_COLS, nPartitions);
    const rows = Math.ceil(nPartitions / MAX_COLS);

    const SQ = Math.max(44, Math.min(96,
        Math.floor((containerWidth - PAD * 2 - H_GAP * (cols - 1)) / cols)
    ));
    const rowW = cols * SQ + H_GAP * (cols - 1);
    const svgW = PAD * 2 + rowW;

    const labelH = 18;   // space above squares for partition labels
    const countH = 30;   // space below squares for hit/total + local pi
    const rowBlockH = labelH + SQ + countH;
    const rowsH = rows * rowBlockH + (rows - 1) * V_GAP;
    const arrowH = 34;   // space for merge arrows
    const dW = 200;  // driver box width
    const dH = 42;   // driver box height
    const svgH = rowsH + arrowH + dH + 14;

    const driverY = rowsH + arrowH;
    const driverX = (svgW - dW) / 2;
    const laneLabel = nPartitions === 1 ? 'lane' : 'lanes';
    const partitionColour = idx => C_PART[idx % C_PART.length];

    //Render 
    if (!piData) return null;

    const sparkResult = piData.estimate;
    const sparkSamples = piData.num_samples?.toLocaleString() ?? '?';
    const sparkError = sparkResult != null
        ? Math.abs(sparkResult - Math.PI).toFixed(6)
        : '—';

    return (
        <div style={{border: '1px solid var(--grey-300)', borderRadius: '6px', background: neutralWhite}}>

            {/*Header*/}
            <div style={{
                padding: '10px 16px', background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <span style={{
                        fontSize: '13px', fontWeight: 'bold',
                        color: 'var(--grey-900)', fontFamily: 'var(--font-mono)'
                    }}>
                        Monte Carlo π — Parallel Estimation
                    </span>
                    <span style={{
                        fontSize: '10px', fontWeight: 'bold', padding: '2px 6px',
                        borderRadius: '4px', background: successBg, color: successFg
                    }}>
                        SPARK EXECUTED — {sparkSamples} samples
                    </span>
                </div>
                <button
                    onClick={startAnimation}
                    style={{
                        fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
                        border: '1px solid var(--grey-300)', background: 'var(--grey-50)',
                        color: 'var(--grey-600)', cursor: 'pointer', fontFamily: 'var(--font-mono)'
                    }}
                >
                    ↺ Replay
                </button>
            </div>

            {/*Legend*/}
            <div style={{
                padding: '5px 16px', borderBottom: '1px solid var(--grey-100)',
                display: 'flex', gap: '14px', fontSize: '10px', color: 'var(--grey-500)'
            }}>
                {[
                    {s: {width: 8, height: 8, borderRadius: '50%', background: C_IN}, label: 'Inside arc (hit)'},
                    {s: {width: 8, height: 8, borderRadius: '50%', background: C_OUT}, label: 'Outside arc (miss)'},
                    {
                        s: {width: 10, height: 10, borderRadius: 2, background: chartBlueTint, border: `1px solid ${chartBlue}`},
                        label: 'Quarter circle (x²+y²≤1)'
                    },
                ].map(({s, label}) => (
                    <span key={label} style={{display: 'flex', alignItems: 'center', gap: 4}}>
                        <span style={{...s, display: 'inline-block', flexShrink: 0}}/>
                        {label}
                    </span>
                ))}
            </div>

            {/*SVG animation*/}
            <div ref={wrapRef} style={{padding: '10px 0'}}>
                <svg
                    width={svgW}
                    height={svgH}
                    style={{display: 'block', margin: '0 auto', overflow: 'visible'}}
                >
                    {/*Partition squares*/}
                    {Array.from({length: nPartitions}, (_, p) => {
                        const col = p % cols;
                        const row = Math.floor(p / cols);
                        const px = PAD + col * (SQ + H_GAP);
                        const py = row * (rowBlockH + V_GAP);
                        const pDots = dotsByPartition[p];

                        return (
                            <g key={p} transform={`translate(${px}, ${py + labelH})`}>
                                {/* Partition label */}
                                <text
                                    x={SQ / 2} y={-5}
                                    textAnchor="middle" fontSize={10} fontWeight="bold"
                                        fontFamily="var(--font-mono)" fill={partitionColour(p)}
                                >
                                    P{p}
                                </text>

                                {/* Square background */}
                                <rect
                                    width={SQ} height={SQ} rx={3}
                                    fill={neutralSurface} stroke="var(--grey-200)" strokeWidth={1}
                                />

                                {/* Quarter-circle arc (the region x²+y²≤1) */}
                                <path
                                    d={arcPath(SQ)}
                                    fill={chartBlueTint} fillOpacity={0.5}
                                    stroke={C_IN} strokeWidth={1.5} strokeOpacity={0.6}
                                />

                                {/* Dots */}
                                {pDots.map((dot, i) => (
                                    <circle
                                        key={i}
                                        cx={(1 - dot.x) * SQ}
                                        cy={(1 - dot.y) * SQ}
                                        r={2.2}
                                        fill={dot.inside ? C_OUT : C_IN}
                                        opacity={0.75}
                                    />
                                ))}

                                {/* Hit/total below square */}
                                <text
                                    x={SQ / 2} y={SQ + 14}
                                    textAnchor="middle" fontSize={9}
                                    fontFamily="var(--font-mono)" fill="var(--grey-500)"
                                >
                                    {perPart[p].hits}/{perPart[p].total}
                                </text>
                                {/* Local π estimate */}
                                <text
                                    x={SQ / 2} y={SQ + 26}
                                    textAnchor="middle" fontSize={8}
                                    fontFamily="var(--font-mono)"
                                    fill={perPart[p].localEst != null ? partitionColour(p) : 'var(--grey-200)'}
                                >
                                    {perPart[p].localEst != null
                                        ? `π≈${perPart[p].localEst.toFixed(3)}`
                                        : '—'}
                                </text>
                            </g>
                        );
                    })}

                    {/*Merge arrows: partitions -> driver (fade in when done)*/}
                    {Array.from({length: nPartitions}, (_, p) => {
                        const col = p % cols;
                        const row = Math.floor(p / cols);
                        const srcX = PAD + col * (SQ + H_GAP) + SQ / 2;
                        const srcY = row * (rowBlockH + V_GAP) + labelH + SQ + countH;
                        const destX = driverX + dW / 2;
                        return (
                            <path
                                key={p}
                                d={`M${srcX},${srcY} Q${(srcX + destX) / 2},${srcY + 10} ${destX},${driverY}`}
                                fill="none"
                                stroke={C_DONE}
                                strokeWidth={1.5}
                                strokeDasharray="5,3"
                                opacity={phase === 'done' ? 0.55 : 0.08}
                                style={{transition: 'opacity 0.6s ease'}}
                            />
                        );
                    })}

                    {/*Driver node*/}
                    <rect
                        x={driverX} y={driverY} width={dW} height={dH} rx={6}
                        fill={phase === 'done' ? C_DONE : 'var(--grey-100)'}
                        style={{transition: 'fill 0.5s ease'}}
                    />
                    <text
                        x={driverX + dW / 2} y={driverY + 16}
                        textAnchor="middle" fontSize={11} fontWeight="bold"
                        fontFamily="var(--font-mono)"
                                        fill={phase === 'done' ? neutralWhite : 'var(--grey-300)'}
                    >
                        DRIVER — aggregate
                    </text>
                    <text
                        x={driverX + dW / 2} y={driverY + 31}
                        textAnchor="middle"
                        fontSize={phase === 'done' ? 13 : 10}
                        fontWeight="bold"
                        fontFamily="var(--font-mono)"
                        fill={phase === 'done' ? neutralWhite : 'var(--grey-300)'}
                        style={{transition: 'font-size 0.3s'}}
                    >
                        {phase === 'done' && animEst != null
                            ? `π ≈ ${animEst.toFixed(5)}`
                            : 'waiting for partitions…'}
                    </text>
                </svg>
            </div>

            {/*Running estimate bar*/}
            <div style={{
                margin: '0 16px 10px',
                padding: '10px 14px',
                borderRadius: '5px',
                background: 'var(--grey-50)',
                border: '1px solid var(--grey-200)',
                display: 'flex', alignItems: 'center', gap: '16px',
                fontFamily: 'var(--font-mono)', fontSize: '12px'
            }}>
                <span style={{color: 'var(--grey-500)'}}>
                    Animation: {hits} hits / {total} samples
                </span>
                <span style={{
                    fontSize: '15px', fontWeight: 'bold',
                    color: phase === 'done' ? C_DONE : 'var(--grey-700)'
                }}>
                    π ≈ {animEst != null ? animEst.toFixed(5) : '—'}
                </span>
                {phase === 'done' && (
                    <span style={{fontSize: '10px', color: 'var(--grey-400)'}}>
                        ({nPartitions * DOTS_PER_PART} sample animation — error: {
                        animEst != null
                            ? Math.abs(animEst - Math.PI).toFixed(4)
                            : '—'
                    })
                    </span>
                )}
            </div>

            {/*Spark result comparison */}
            {phase === 'done' && (
                <div style={{
                    margin: '0 16px 12px',
                    padding: '12px 14px',
                    borderRadius: '5px',
                    border: `1px solid ${C_DONE}44`,
                    background: '#f0fff8'
                }}>
                    <div style={{
                        fontSize: '10px', fontWeight: 'bold',
                        color: C_DONE, textTransform: 'uppercase',
                        letterSpacing: '0.5px', marginBottom: '8px',
                        fontFamily: 'var(--font-mono)'
                    }}>
                        Spark executed on your cluster — {sparkSamples} samples
                    </div>
                    <div style={{display: 'flex', gap: '28px', alignItems: 'baseline'}}>
                        <div>
                            <div style={{
                                fontSize: '9px',
                                color: 'var(--grey-500)',
                                textTransform: 'uppercase',
                                marginBottom: '2px'
                            }}>
                                Spark estimate
                            </div>
                            <div style={{
                                fontSize: '22px', fontWeight: 'bold',
                                fontFamily: 'var(--font-mono)', color: C_DONE
                            }}>
                                {sparkResult?.toFixed(6) ?? '—'}
                            </div>
                        </div>
                        <div>
                            <div style={{
                                fontSize: '9px',
                                color: 'var(--grey-500)',
                                textTransform: 'uppercase',
                                marginBottom: '2px'
                            }}>
                                Actual π
                            </div>
                            <div style={{
                                fontSize: '22px', fontWeight: 'bold',
                                fontFamily: 'var(--font-mono)', color: 'var(--grey-300)'
                            }}>
                                3.141593
                            </div>
                        </div>
                        <div>
                            <div style={{
                                fontSize: '9px',
                                color: 'var(--grey-500)',
                                textTransform: 'uppercase',
                                marginBottom: '2px'
                            }}>
                                Error
                            </div>
                            <div style={{
                                fontSize: '18px', fontWeight: 'bold',
                                fontFamily: 'var(--font-mono)', color: 'var(--grey-600)'
                            }}>
                                {sparkError}
                            </div>
                        </div>
                    </div>
                    <p style={{
                        margin: '10px 0 0', fontSize: '11px',
                        color: 'var(--grey-600)', lineHeight: 1.55
                    }}>
                        The animation above shows {nPartitions * DOTS_PER_PART} samples
                        across {nPartitions} partitions running simultaneously.
                        Spark used {sparkSamples} so more samples {'->'} smaller error.
                        Each partition computed its own local hit count independently;
                        the Driver summed them all to produce the final estimate.
                        This is the core RDD
                        pattern: <code>sc.parallelize(range(N), {nPartitions}).filter(inside).count()</code>
                    </p>
                </div>
            )}

            {/*Guidance callout*/}
            <div style={{
                padding: '7px 16px 10px',
                borderTop: '1px solid var(--grey-100)',
                fontSize: '11px', color: 'var(--grey-600)', lineHeight: 1.55
            }}>
                <strong>What to observe:</strong>{' '}
                All {nPartitions} partition {laneLabel} fill simultaneously, that is parallelism.
                Each local π estimate (shown beneath each square) fluctuates wildly at first
                then converges as more samples land.
                On HPC, <code>sc.parallelize(range(N), {nPartitions})</code> distributes this across the
                configured executor slots.
                On Databricks Serverless the RDD API is blocked, so Spark's DataFrame API
                (<code>spark.range()</code> + <code>rand()</code>) runs the equivalent computation.
            </div>
        </div>
    );
};

export default PiEstimationDiagram;