import './Lab2Layout.css';
import { okabeIto } from '../../theme/palette';

const FEAT_COLOURS = [okabeIto.blue, okabeIto.orange, okabeIto.purple];

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
        <div className="viz-card">
            <div className="viz-card-header">
                <div>
                    <span className="viz-card-title">Regularisation History</span>
                    <span style={{fontSize: '11px', color: 'var(--grey-500)', marginLeft: '10px'}}>
                        try reg_param = 0.0, 0.1, 1.0
                    </span>
                </div>
                <span className="glass-table-badge">
                    {sorted.length} run{sorted.length !== 1 ? 's' : ''} this session
                </span>
            </div>

            <div className="viz-card-body">
                <div className="legend-row" style={{marginBottom: '12px'}}>
                    {['TV', 'radio', 'newspaper'].map((f, i) => (
                        <span key={f} className="legend-item">
                            <span
                                className="legend-item-dot"
                                style={{background: FEAT_COLOURS[i], borderRadius: 2}}
                            />
                            {f}
                        </span>
                    ))}
                    <span style={{marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--grey-500)'}}>
                        Test RMSE
                    </span>
                </div>

                <div className="reg-history-rows">
                    {sorted.map(run => {
                        const current = Number(currentRegParam);
                        const isCurrent = Number.isFinite(current) && run.regParam === current;
                        const isBest = minRmse != null && run.testRmse === minRmse;
                        return (
                            <div
                                key={run.regParam}
                                className={`reg-history-run ${isCurrent ? 'reg-history-run--current' : ''}`}
                            >
                                <div className="reg-history-run-header">
                                    <span className="reg-history-param">regParam={run.regParam}</span>
                                    <span className="reg-history-rmse">
                                        {run.testRmse != null ? run.testRmse.toFixed(4) : 'n/a'}
                                    </span>
                                    {isBest && (
                                        <span className="reg-history-badge reg-history-badge--best">lowest RMSE</span>
                                    )}
                                    {isCurrent && (
                                        <span className="badge badge--current">current</span>
                                    )}
                                    <span className="reg-history-timestamp">{run.timestamp}</span>
                                </div>

                                <div className="reg-history-bars">
                                    {run.featureCols.map((feat, fi) => {
                                        const rawVal = Number(run.coefficients[fi]);
                                        const val = Number.isFinite(rawVal) ? rawVal : 0;
                                        const pct = Math.max((Math.abs(val) / maxCoeff) * 100, 2);
                                        const col = FEAT_COLOURS[fi];
                                        return (
                                            <div key={feat} className="reg-history-bar-row">
                                                <span className="reg-history-bar-label">{feat}</span>
                                                <div className="reg-history-bar-track">
                                                    <div
                                                        className="reg-history-bar-fill"
                                                        style={{width: `${pct}%`, background: col}}
                                                    >
                                                        <span className="reg-history-bar-value">{val.toFixed(3)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="callout callout--info" style={{marginTop: '12px'}}>
                    <strong>What to observe:</strong>{' '}TV and radio shrink under Ridge regularisation.
                    Newspaper grows because it shares variance with radio (r=0.35) and absorbs what radio releases.
                    RMSE rises monotonically: this 200-row dataset has no overfitting to fight.
                    On a large, high-dimensional dataset you would see RMSE dip before rising.
                </div>
            </div>
        </div>
    );
}

export default RegularisationHistory;
