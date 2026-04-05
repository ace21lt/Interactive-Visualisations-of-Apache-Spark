import React from 'react';

// Shows execution time comparison across partition count changes.
// Builds up as the student reruns Step 2 with different NUM_PARTITIONS values.
// Up to 8 entries stored — latest per partition count wins.
const PartitionTimingChart = ({runHistory}) => {
    if (!runHistory || runHistory.length === 0) return null;

    const sorted = [...runHistory].sort((a, b) => a.partitions - b.partitions);
    const maxSecs = Math.max(...sorted.map(r => r.executionSecs ?? r.roundTripSecs), 1);

    // Colour scale: fewer partitions = warmer (more bottleneck risk)
    const barColour = (partitions) => {
        if (partitions <= 2) return '#ef4444'; // red — very few, likely bottleneck
        if (partitions <= 6) return '#f97316'; // orange
        if (partitions <= 12) return '#10b981'; // green — sensible range
        return '#6366f1';                        // indigo — many partitions
    };

    return (
        <div style={{
            border: '1px solid var(--grey-200)',
            borderRadius: '6px',
            background: '#fff',
            overflow: 'hidden',
            marginTop: '8px',
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
                        Execution Time vs NUM_PARTITIONS
                    </span>
                    <span style={{fontSize: '11px', color: 'var(--grey-500)', marginLeft: '10px'}}>
                        try 4, 8, 16, 32 to compare
                    </span>
                </div>
                <span style={{fontSize: '11px', color: 'var(--grey-400)'}}>
                    {sorted.length} run{sorted.length !== 1 ? 's' : ''} recorded this session
                </span>
            </div>

            <div style={{padding: '16px'}}>
                {/* Bar chart */}
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {sorted.map((run, i) => {
                        // Use Databricks API execution time if available, else round-trip
                        const displaySecs = run.executionSecs ?? run.roundTripSecs;
                        const pct = Math.max((displaySecs / maxSecs) * 100, 4);
                        const colour = barColour(run.partitions);
                        const isBest = displaySecs === Math.min(...sorted.map(r => r.executionSecs ?? r.roundTripSecs));

                        return (
                            <div key={run.partitions} style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                {/* Partition label */}
                                <div style={{
                                    width: '80px', flexShrink: 0,
                                    fontFamily: 'var(--font-mono)', fontSize: '12px',
                                    fontWeight: 'bold', color: 'var(--grey-800)',
                                    textAlign: 'right',
                                }}>
                                    {run.partitions}p
                                </div>

                                {/* Bar */}
                                <div style={{
                                    flex: 1,
                                    background: 'var(--grey-100)',
                                    borderRadius: '4px',
                                    height: '28px',
                                    position: 'relative'
                                }}>
                                    <div style={{
                                        width: `${pct}%`,
                                        height: '100%',
                                        background: colour,
                                        borderRadius: '4px',
                                        transition: 'width 0.4s ease',
                                        opacity: run.skipped ? 0.5 : 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        paddingLeft: '8px',
                                        boxSizing: 'border-box',
                                        minWidth: '40px',
                                    }}>
                                        <span style={{
                                            color: '#fff',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {run.executionSecs ?? run.roundTripSecs}s
                                            {run.skipped ? ' (cached)' : ''}
                                        </span>
                                    </div>
                                    {isBest && (
                                        <span style={{
                                            position: 'absolute', right: '6px', top: '50%',
                                            transform: 'translateY(-50%)',
                                            fontSize: '10px', fontWeight: 'bold',
                                            color: '#15803d', background: '#dcfce7',
                                            padding: '1px 5px', borderRadius: '3px',
                                        }}>
                                            fastest ✓
                                        </span>
                                    )}
                                </div>

                                {/* Step 2 detail */}
                                {run.executionSecs != null && (
                                    <div style={{
                                        width: '100px',
                                        flexShrink: 0,
                                        fontSize: '11px',
                                        color: 'var(--grey-500)'
                                    }}>
                                        Databricks: {run.executionSecs}s
                                    </div>
                                )}
                                <div style={{width: '55px', flexShrink: 0, fontSize: '11px', color: 'var(--grey-400)'}}>
                                    {run.timestamp}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Guidance */}
                <div style={{
                    marginTop: '12px', padding: '8px 12px',
                    background: '#f0f9ff', borderLeft: '3px solid #0ea5e9',
                    borderRadius: '4px', fontSize: '11px', color: '#0369a1',
                }}>
                    <strong>What to look for:</strong> Fewer partitions means less parallelism but less shuffle
                    overhead.
                    More partitions means more parallel workers but higher coordination cost.
                    The sweet spot for this dataset is usually 8–16 partitions on Databricks Serverless.
                    Runs marked <em>(cached)</em> reused the existing Delta table — the write time was skipped.
                </div>
            </div>
        </div>
    );
};

export default PartitionTimingChart;