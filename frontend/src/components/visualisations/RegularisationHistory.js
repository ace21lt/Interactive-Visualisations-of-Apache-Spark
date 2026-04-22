//RegularisationHistory
//Accumulated bar chart comparing coefficients and RMSE across reg_param runs this session

const FEAT_COLOURS = ['#0072B2', '#E69F00', '#CC79A7'];

function RegularisationHistory({regHistory, currentRegParam}) {
    if (!Array.isArray(regHistory) || regHistory.length === 0) return null;

    const sorted = regHistory
        .map(run => {
            if (!Array.isArray(run?.coefficients) || !Array.isArray(run?.featureCols)) return null;
            const regParam = Number(run.regParam);
            const testRmse = run.testRmse == null ? null : Number(run.testRmse);
            if (!Number.isFinite(regParam)) return null;
            return {
                ...run,
                regParam,
                testRmse: Number.isFinite(testRmse) ? testRmse : null,
                featureCols: run.featureCols,
                coefficients: run.coefficients,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.regParam - b.regParam);

    if (sorted.length === 0) return null;

    const allCoeffs = sorted.flatMap(r => r.coefficients.map(v => Math.abs(Number(v))).filter(Number.isFinite));
    const maxCoeff = Math.max(...allCoeffs, 0.01);
    const rmseValues = sorted.map(r => r.testRmse).filter(Number.isFinite);
    const minRmse = rmseValues.length ? Math.min(...rmseValues) : null;

    return (
        <div style={{border: '1px solid var(--grey-300)', borderRadius: '6px', background: '#fff'}}>

            {/* Header */}
            <div style={{
                padding: '10px 16px',
                background: 'var(--grey-50)',
                borderBottom: '2px solid var(--uos-purple)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <span style={{
                        fontSize: '13px', fontWeight: 'bold', color: 'var(--grey-900)', fontFamily: 'var(--font-mono)'
                    }}>
                        Regularisation History
                    </span>
                    <span style={{fontSize: '11px', color: 'var(--grey-500)', marginLeft: '10px'}}>
                        try reg_param = 0.0, 0.1, 1.0
                    </span>
                </div>
                <span style={{fontSize: '11px', color: 'var(--grey-400)'}}>
                    {sorted.length} run{sorted.length !== 1 ? 's' : ''} this session
                </span>
            </div>

            <div style={{padding: '12px 16px'}}>

                {/* Legend */}
                <div style={{
                    display: 'flex', gap: '14px', marginBottom: '12px', fontSize: '10px', color: 'var(--grey-500)'
                }}>
                    {['TV', 'radio', 'newspaper'].map((f, i) => (
                        <span key={f} style={{display: 'flex', alignItems: 'center', gap: 4}}>
                            <span style={{
                                width: 10,
                                height: 10,
                                background: FEAT_COLOURS[i],
                                borderRadius: 2,
                                display: 'inline-block'
                            }}/>
                            {f}
                        </span>))}
                    <span style={{marginLeft: 'auto', fontFamily: 'var(--font-mono)'}}>Test RMSE</span>
                </div>

                {/* One row per regParam the student has run */}
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {sorted.map(run => {
                        const current = Number(currentRegParam);
                        const isCurrent = Number.isFinite(current) && run.regParam === current;
                        const isBest = minRmse != null && run.testRmse === minRmse;
                        return (<div key={run.regParam} style={{
                            border: isCurrent ? '1.5px solid var(--uos-purple)' : '1px solid var(--grey-100)',
                            borderRadius: '5px',
                            padding: '8px 10px',
                            background: isCurrent ? '#faf5ff' : '#fff'
                        }}>
                            {/* Row header */}
                            <div style={{display: 'flex', alignItems: 'center', marginBottom: '6px'}}>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        color: 'var(--uos-purple)',
                                        width: '100px',
                                        flexShrink: 0
                                    }}>
                                        regParam={run.regParam}
                                    </span>
                                <span style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    color: '#009E73',
                                    marginLeft: 'auto'
                                }}>
                                        {run.testRmse != null ? run.testRmse.toFixed(4) : 'n/a'}
                                    </span>
                                {isBest && (<span style={{
                                    marginLeft: '6px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    color: '#15803d',
                                    background: '#dcfce7',
                                    padding: '1px 5px',
                                    borderRadius: '3px'
                                }}>lowest RMSE</span>)}
                                {isCurrent && (<span style={{
                                    marginLeft: '6px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    color: 'var(--uos-purple)',
                                    background: '#f0e6ff',
                                    padding: '1px 5px',
                                    borderRadius: '3px'
                                }}>current</span>)}
                                <span style={{
                                    marginLeft: '8px',
                                    fontSize: '10px',
                                    color: 'var(--grey-400)',
                                    fontFamily: 'var(--font-mono)'
                                }}>{run.timestamp}</span>
                            </div>

                            {/* Coefficient bars — one per feature */}
                            <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                                {run.featureCols.map((feat, fi) => {
                                    const rawVal = Number(run.coefficients[fi]);
                                    const val = Number.isFinite(rawVal) ? rawVal : 0;
                                    const pct = Math.max((Math.abs(val) / maxCoeff) * 100, 2);
                                    const col = FEAT_COLOURS[fi];
                                    return (
                                        <div key={feat} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                                <span style={{
                                                    width: '72px',
                                                    flexShrink: 0,
                                                    textAlign: 'right',
                                                    fontSize: '11px',
                                                    color: 'var(--grey-600)',
                                                    fontFamily: 'var(--font-mono)'
                                                }}>{feat}</span>
                                            <div style={{
                                                flex: 1,
                                                background: 'var(--grey-100)',
                                                borderRadius: '3px',
                                                height: '20px',
                                                position: 'relative'
                                            }}>
                                                <div style={{
                                                    width: `${pct}%`,
                                                    height: '100%',
                                                    background: col,
                                                    borderRadius: '3px',
                                                    transition: 'width 0.5s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    paddingLeft: '6px',
                                                    boxSizing: 'border-box',
                                                    minWidth: '30px'
                                                }}>
                                                        <span style={{
                                                            color: '#fff',
                                                            fontSize: '10px',
                                                            fontFamily: 'var(--font-mono)',
                                                            fontWeight: 'bold',
                                                            whiteSpace: 'nowrap'
                                                        }}>{val.toFixed(3)}</span>
                                                </div>
                                            </div>
                                        </div>);
                                })}
                            </div>
                        </div>);
                    })}
                </div>

                {/* Guidance callout */}
                <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: '#f0f9ff',
                    borderLeft: '3px solid #0ea5e9',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#0369a1'
                }}>
                    <strong>What to observe:</strong>{' '}TV and radio shrink under Ridge regularisation.
                    Newspaper grows — it shares variance with radio (r=0.35) and absorbs what radio releases.
                    RMSE rises monotonically: this 200-row dataset has no overfitting to fight.
                    On a large, high-dimensional dataset you would see RMSE dip before rising.
                </div>
            </div>
        </div>);
}

export default RegularisationHistory;