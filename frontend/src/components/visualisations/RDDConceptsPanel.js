//RDD concepts panel — Step 1
//Shows Pi estimation live result and the three RDD concepts blocked on Serverless
function RDDConceptsPanel({concepts, piEstimation}) {
    if (!concepts) return null;
    const items = [
        {key: 'parallelized_collections', label: 'Parallelised Collections'},
        {key: 'broadcast_variables', label: 'Broadcast Variables'},
        {key: 'accumulators', label: 'Accumulators'},
    ];
    return (<>
        {/* Live pi estimation */}
        {piEstimation && (<div style={{
            border: '1px solid var(--grey-300)',
            borderRadius: '6px',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                padding: '10px 16px',
                background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                        <span style={{
                            fontSize: '13px',
                            fontWeight: 'bold',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--grey-900)'
                        }}>
                            Pi Estimation (Monte Carlo)
                        </span>
                <span style={{
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#e8f5e9',
                    color: '#1b5e20'
                }}>LIVE — SPARK EXECUTED</span>
            </div>
            <div style={{padding: '14px 16px', display: 'flex', gap: '24px', alignItems: 'baseline'}}>
                <div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--grey-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>Estimate
                    </div>
                    <div style={{
                        fontSize: '22px',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--uos-purple)'
                    }}>
                        {piEstimation.estimate?.toFixed(6)}
                    </div>
                </div>
                <div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--grey-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>Actual π
                    </div>
                    <div style={{
                        fontSize: '22px',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--grey-400)'
                    }}>
                        3.141593
                    </div>
                </div>
                <div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--grey-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>Samples
                    </div>
                    <div style={{
                        fontSize: '15px',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--grey-700)'
                    }}>
                        {(piEstimation.num_samples ?? 0).toLocaleString()}
                    </div>
                </div>
                <div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--grey-500)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>Error
                    </div>
                    <div style={{
                        fontSize: '15px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: '#009E73'
                    }}>
                        {piEstimation.estimate != null ? Math.abs(piEstimation.estimate - Math.PI).toFixed(6) : '—'}
                    </div>
                </div>
            </div>
            <div style={{padding: '0 16px 12px', fontSize: '11px', color: 'var(--grey-500)'}}>
                {piEstimation.method}
            </div>
        </div>)}

        {/* RDD concepts */}
        <div style={{
            border: '1px solid var(--grey-300)',
            borderRadius: '6px',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                padding: '10px 16px',
                background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                    <span style={{
                        fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--grey-900)'
                    }}>
                        RDD & Shared Variables
                    </span>
                <span style={{
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#fff3e0',
                    color: '#e65100',
                    border: '1px solid #ffe0b2'
                }}>BLOCKED ON SERVERLESS</span>
            </div>
            <div style={{padding: '12px 16px'}}>
                <p style={{fontSize: '12px', color: 'var(--grey-500)', margin: '0 0 12px'}}>
                    These require SparkContext (RDD API), which Serverless does not expose.
                    The lab teaches these on HPC which are shown here for reference with DataFrame equivalents.
                </p>
                {items.map(({key, label}) => {
                    const c = concepts[key];
                    if (!c) return null;
                    return (<div key={key} style={{marginBottom: '14px'}}>
                        <div style={{
                            fontSize: '12px', fontWeight: 'bold', color: 'var(--grey-700)', marginBottom: '4px'
                        }}>{label}</div>
                        <p style={{
                            fontSize: '12px', color: 'var(--grey-600)', margin: '0 0 4px'
                        }}>{c.description}</p>
                        <pre style={{
                            background: '#1e1e1e',
                            color: '#d4d4d4',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            overflowX: 'auto',
                            margin: '0 0 4px',
                            lineHeight: '1.5'
                        }}>{c.example_code}</pre>
                        <div style={{
                            fontSize: '11px',
                            color: '#b45309',
                            background: '#fff8e1',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            borderLeft: '3px solid #E69F00'
                        }}>
                            {c.serverless_note}
                        </div>
                    </div>);
                })}
            </div>
        </div>
    </>);
}

export default RDDConceptsPanel;