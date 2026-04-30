import './Lab2Layout.css';

// RDD concepts panel: Step 1
// Shows the live pi estimation result alongside the three RDD concepts
function RDDConceptsPanel({concepts, piEstimation}) {
    if (!concepts) return null;

    const items = [
        {key: 'parallelized_collections', label: 'Parallelised Collections'},
        {key: 'broadcast_variables', label: 'Broadcast Variables'},
        {key: 'accumulators', label: 'Accumulators'},
    ];

    return (
        <>
            {piEstimation && (
                <div className="viz-card">
                    <div className="viz-card-header">
                        <span className="viz-card-title">Pi Estimation (Monte Carlo)</span>
                        <span className="badge badge--live">LIVE: SPARK EXECUTED</span>
                    </div>

                    <div className="stat-group">
                        <div>
                            <div className="stat-label">Estimate</div>
                            <div className="stat-value stat-value--xl" style={{color: 'var(--uos-purple)'}}>
                                {piEstimation.estimate?.toFixed(6)}
                            </div>
                        </div>
                        <div>
                            <div className="stat-label">Actual π</div>
                            <div className="stat-value stat-value--xl" style={{color: 'var(--grey-400)'}}>
                                3.141593
                            </div>
                        </div>
                        <div>
                            <div className="stat-label">Samples</div>
                            <div className="stat-value stat-value--lg">
                                {(piEstimation.num_samples ?? 0).toLocaleString()}
                            </div>
                        </div>
                        <div>
                            <div className="stat-label">Error</div>
                            <div className="stat-value stat-value--lg" style={{color: '#009E73'}}>
                                {piEstimation.estimate != null
                                    ? Math.abs(piEstimation.estimate - Math.PI).toFixed(6)
                                    : '-'}
                            </div>
                        </div>
                    </div>

                    <div className="viz-card-footer">{piEstimation.method}</div>
                </div>
            )}

            <div className="viz-card">
                <div className="viz-card-header">
                    <span className="viz-card-title">RDD &amp; Shared Variables</span>
                    <span className="badge badge--blocked">BLOCKED ON SERVERLESS</span>
                </div>

                <div className="viz-card-body">
                    <p className="rdd-intro">
                        These require SparkContext (RDD API), which Serverless does not expose.
                        The lab teaches these on HPC, shown here for reference with DataFrame equivalents.
                    </p>
                    {items.map(({key, label}) => {
                        const c = concepts[key];
                        if (!c) return null;
                        return (
                            <div key={key} className="rdd-concept">
                                <div className="rdd-concept-title">{label}</div>
                                <p className="rdd-concept-desc">{c.description}</p>
                                <pre className="rdd-code">{c.example_code}</pre>
                                <div className="rdd-serverless-note">{c.serverless_note}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

export default RDDConceptsPanel;