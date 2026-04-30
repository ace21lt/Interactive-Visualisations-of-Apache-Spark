import './Lab2Layout.css';

const PiHistoryChart = ({piHistory}) => {
    if (!piHistory || piHistory.length === 0) return null;

    const sorted = [...piHistory].sort(
        (a, b) => (a.samples - b.samples) || (a.partitions - b.partitions)
    );

    const maxMs = Math.max(...sorted.map(r => r.elapsedMs ?? 1), 1);
    const minMs = Math.min(...sorted.map(r => r.elapsedMs ?? Infinity));
    const minError = Math.min(...sorted.map(r => r.error ?? Infinity));

    const barColour = (partitions) => {
        if (partitions <= 2) return '#ef4444';
        if (partitions <= 6) return '#f97316';
        if (partitions <= 12) return '#10b981';
        return '#6366f1';
    };

    const formatSamples = (n) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
    };

    return (
        <div className="viz-card">
            <div className="viz-card-header">
                <div>
                    <span className="viz-card-title">π Estimation: Time & Error History</span>
                    <span style={{fontSize: '11px', color: 'var(--grey-500)', marginLeft: '10px'}}>
                        vary NUM_PARTITIONS and NUM_SAMPLES in the editor
                    </span>
                </div>
                <span className="glass-table-badge">
                    {sorted.length} run{sorted.length !== 1 ? 's' : ''} this session
                </span>
            </div>

            <div className="viz-card-body">
                <div className="pi-history-rows">
                    {sorted.map((run) => {
                        const pct = Math.max((run.elapsedMs / maxMs) * 100, 4);
                        const colour = barColour(run.partitions);
                        const isFastest = run.elapsedMs === minMs;
                        const isMostPrecise = run.error === minError;

                        return (
                            <div key={`${run.partitions}-${run.samples}`} className="pi-history-row">
                                <div className="pi-history-config">
                                    {run.partitions}p · {formatSamples(run.samples)}
                                </div>

                                <div className="pi-history-bar-track">
                                    <div
                                        className="pi-history-bar-fill"
                                        style={{width: `${pct}%`, background: colour}}
                                    >
                                        <span className="pi-history-bar-label">{run.elapsedMs} ms</span>
                                    </div>
                                    {isFastest && (
                                        <span className="pi-history-badge pi-history-badge--fastest">fastest ✓</span>
                                    )}
                                    {isMostPrecise && !isFastest && (
                                        <span className="pi-history-badge pi-history-badge--precise">most precise ✓</span>
                                    )}
                                </div>

                                <div className="pi-history-error">
                                    error: <span className="pi-history-error-value">{run.error?.toFixed(6)}</span>
                                </div>

                                <div className="pi-history-timestamp">{run.timestamp}</div>
                            </div>
                        );
                    })}
                </div>

                <div className="callout callout--info" style={{marginTop: '12px'}}>
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
