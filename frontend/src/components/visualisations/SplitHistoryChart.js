import React, {useEffect, useMemo, useState} from 'react';
import './SplitHistoryChart.css';

const formatRatio = (ratio) => {
    if (!Array.isArray(ratio) || ratio.length < 2) return '—';
    const [train, test] = ratio;
    const trainPct = Number.isFinite(Number(train)) ? Math.round(Number(train) * 100) : null;
    const testPct = Number.isFinite(Number(test)) ? Math.round(Number(test) * 100) : null;
    if (trainPct == null || testPct == null) return `${String(train)} / ${String(test)}`;
    return `${trainPct}% / ${testPct}%`;
};

const formatRowValue = (value) => {
    if (value == null) return '—';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    return String(value);
};

const renderRows = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return (
            <div className="split-history-rows-empty">
                No row samples stored for this run.
            </div>
        );
    }
    const columns = rows[0] ? Object.keys(rows[0]) : [];

    return (
        <div className="split-history-rows">
            {rows.slice(0, 5).map((row, rowIndex) => {
                const line = columns.map((k) => `${k}=${formatRowValue(row[k])}`).join('  |  ');
                return (
                    <div
                        key={rowIndex}
                        className="split-history-row-line"
                    >
                        {line}
                    </div>
                );
            })}
        </div>
    );
};

const SplitHistoryChart = ({splitHistory = [], currentSeed, currentRatio}) => {
    const [selectedKey, setSelectedKey] = useState('');

    const sorted = useMemo(() => [...splitHistory].reverse(), [splitHistory]);
    const keyFor = (run) => `${run.seed}-${JSON.stringify(run.splitRatio ?? [])}`;

    useEffect(() => {
        if (sorted.length === 0) {
            setSelectedKey('');
            return;
        }
        const stillExists = sorted.some((run) => keyFor(run) === selectedKey);
        if (!stillExists) {
            setSelectedKey(keyFor(sorted[0]));
        }
    }, [sorted, selectedKey]);

    if (!Array.isArray(sorted) || sorted.length === 0) return null;

    const selected = sorted.find((run) => keyFor(run) === selectedKey) ?? sorted[0];
    const currentKey = `${currentSeed}-${JSON.stringify(currentRatio ?? [])}`;

    return (
        <div className="split-history">
            <div className="split-history-header">
                <div>
                    <span className="split-history-title">
                        Split History
                    </span>
                    <span className="split-history-subtitle">
                        rerun Step 4 after changing seed or ratio
                    </span>
                </div>
                <span className="split-history-count">
                    {sorted.length} run{sorted.length !== 1 ? 's' : ''} recorded this session
                </span>
            </div>

            <div className="split-history-body">
                <div className="split-history-list">
                    {sorted.map((run, idx) => {
                        const totalPct = Math.max((Number(run.actualTrainPct ?? 0) + Number(run.actualTestPct ?? 0)), 1);
                        const trainPct = Math.max(Number(run.actualTrainPct ?? 0), 0);
                        const testPct = Math.max(Number(run.actualTestPct ?? 0), 0);
                        const isSelected = keyFor(run) === keyFor(selected);
                        const isCurrent = keyFor(run) === currentKey;

                        return (
                            <button
                                key={`${run.seed}-${JSON.stringify(run.splitRatio ?? [])}-${run.timestamp ?? idx}`}
                                onClick={() => setSelectedKey(keyFor(run))}
                                className={`split-history-run ${isSelected ? 'split-history-run-selected' : ''}`}
                            >
                                <div className="split-history-row">
                                    <div className="split-history-seed">
                                        seed={run.seed}
                                    </div>

                                    <div className="split-history-bar">
                                        <div className="split-history-train" style={{
                                            width: `${(trainPct / totalPct) * 100}%`,
                                            minWidth: '30px'
                                        }}>
                                            Train {run.actualTrainPct ?? '?'}%
                                        </div>
                                        <div className="split-history-test" style={{
                                            width: `${(testPct / totalPct) * 100}%`,
                                            minWidth: '30px'
                                        }}>
                                            Test {run.actualTestPct ?? '?'}%
                                        </div>
                                    </div>

                                    <div className="split-history-ratio">
                                        {formatRatio(run.splitRatio)}
                                    </div>

                                    <div className="split-history-counts">
                                        {run.trainCount ?? '?'} train · {run.testCount ?? '?'} test
                                    </div>

                                    {isCurrent && (
                                        <span className="split-history-current">
                                            current
                                        </span>
                                    )}
                                </div>
                                <div className="split-history-timestamp">
                                    {run.timestamp}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {selected && (
                    <div className="split-history-detail">
                        <div className="split-history-detail-head">
                            <div className="split-history-detail-title">
                                seed={selected.seed} · split {formatRatio(selected.splitRatio)}
                            </div>
                            <div className="split-history-detail-time">
                                {selected.timestamp}
                            </div>
                        </div>

                        <p className="split-history-detail-note">
                            Same seed, different ratio means the hash stays the same, but the cutoff moves.
                            Rows near the boundary can switch between train and test.
                        </p>

                        <div className="split-history-grid">
                            <div>
                                <div className="split-history-grid-title split-history-grid-title-train">
                                    Train rows
                                </div>
                                {renderRows(selected.trainSample)}
                            </div>
                            <div>
                                <div className="split-history-grid-title split-history-grid-title-test">
                                    Test rows
                                </div>
                                {renderRows(selected.testSample)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SplitHistoryChart;





