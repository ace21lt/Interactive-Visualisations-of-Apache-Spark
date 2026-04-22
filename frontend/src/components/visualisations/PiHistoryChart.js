import React from 'react';

// Shows execution time and error comparison across pi estimation runs.
// Builds up as the student reruns Step 1 with different NUM_PARTITIONS and NUM_SAMPLES values.
const PiHistoryChart = ({piHistory}) => {
    if (!piHistory || piHistory.length === 0) return null;

    // Sort by samples first, then partitions
    const sorted = [...piHistory].sort(
        (a, b) => (a.samples - b.samples) || (a.partitions - b.partitions)
    );

    const maxMs = Math.max(...sorted.map(r => r.elapsedMs ?? 1), 1);
    const minMs = Math.min(...sorted.map(r => r.elapsedMs ?? Infinity));
    const minError = Math.min(...sorted.map(r => r.error ?? Infinity));

    // Colour scale by partition count
    const barColour = (partitions) => {
        if (partitions <= 2) return '#ef4444';   // red — very few, likely bottleneck
        if (partitions <= 6) return '#f97316';   // orange
        if (partitions <= 12) return '#10b981';  // green — sensible range
        return '#6366f1';                         // indigo — many partitions
    };

    // Compact "10M" style formatting for sample counts
    const formatSamples = (n) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
    };

    return (
        <div style={{
            border: '1px solid var(--grey-200)',
            borderRadius: '6px',
            background: '#fff',
        }}>
            {/* Header */}
            <div style={{
                background: 'var(--grey-50)',
                padding: '10px 16px',
                borderBottom: '2px solid var(--uos-purple)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div>
                    <span style={{fontSize: '13px', fontWeight: 'bold', color: 'var(--grey-900)'}}>
                        π Estimation — Time & Error History
                    </span>
                    <span style={{fontSize: '11px', color: 'var(--grey-500)', marginLeft: '10px'}}>
                        vary NUM_PARTITIONS and NUM_SAMPLES in the editor
                    </span>
                </div>
                <span style={{fontSize: '11px', color: 'var(--grey-400)'}}>
                    {sorted.length} run{sorted.length !== 1 ? 's' : ''} this session
                </span>
            </div>

            <div style={{padding: '16px'}}>

                {/* Bar chart — one row per run */}
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {sorted.map((run) => {
                        const pct = Math.max((run.elapsedMs / maxMs) * 100, 4);
                        const colour = barColour(run.partitions);
                        const isFastest = run.elapsedMs === minMs;
                        const isMostPrecise = run.error === minError;

                        return (
                            <div key={`${run.partitions}-${run.samples}`}
                                 style={{display: 'flex', alignItems: 'center', gap: '10px'}}>

                                {/* Config label: partitions × samples */}
                                <div style={{
                                    width: '92px', flexShrink: 0,
                                    fontFamily: 'var(--font-mono)', fontSize: '12px',
                                    fontWeight: 'bold', color: 'var(--grey-800)',
                                    textAlign: 'right',
                                }}>
                                    {run.partitions}p · {formatSamples(run.samples)}
                                </div>

                                {/* Time bar */}
                                <div style={{
                                    flex: 1,
                                    background: 'var(--grey-100)',
                                    borderRadius: '4px',
                                    height: '28px',
                                    position: 'relative',
                                }}>
                                    <div style={{
                                        width: `${pct}%`,
                                        height: '100%',
                                        background: colour,
                                        borderRadius: '4px',
                                        transition: 'width 0.4s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        paddingLeft: '8px',
                                        boxSizing: 'border-box',
                                        minWidth: '48px',
                                    }}>
                                        <span style={{
                                            color: '#fff',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {run.elapsedMs} ms
                                        </span>
                                    </div>
                                    {(isFastest || isMostPrecise) && (
                                        <span style={{
                                            position: 'absolute',
                                            right: '6px', top: '50%',
                                            transform: 'translateY(-50%)',
                                            fontSize: '10px', fontWeight: 'bold',
                                            color: isFastest ? '#15803d' : '#440099',
                                            background: isFastest ? '#dcfce7' : '#f0e6ff',
                                            padding: '1px 5px', borderRadius: '3px',
                                        }}>
                                            {isFastest ? 'fastest ✓' : 'most precise ✓'}
                                        </span>
                                    )}
                                </div>

                                {/* Error readout */}
                                <div style={{
                                    width: '120px', flexShrink: 0,
                                    fontSize: '11px', color: 'var(--grey-600)',
                                    fontFamily: 'var(--font-mono)',
                                }}>
                                    error: <span style={{color: '#009E73', fontWeight: 'bold'}}>
                                        {run.error?.toFixed(6)}
                                    </span>
                                </div>

                                {/* Timestamp */}
                                <div style={{
                                    width: '55px', flexShrink: 0,
                                    fontSize: '11px', color: 'var(--grey-400)',
                                }}>
                                    {run.timestamp}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{
                    marginTop: '12px', padding: '8px 12px',
                    background: '#f0f9ff', borderLeft: '3px solid #0ea5e9',
                    borderRadius: '4px', fontSize: '11px', color: '#0369a1',
                }}>
                    <strong>What to look for:</strong> error shrinks roughly with √N meaning that
                    quadruple the samples, halve the error. Time grows linearly with samples.
                    More partitions help until the cluster saturates; beyond that, scheduling
                    overhead dominates and time climbs again.
                </div>
            </div>
        </div>
    );
};

export default PiHistoryChart;