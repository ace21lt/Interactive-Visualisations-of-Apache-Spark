import React, {useState, useEffect, useRef, useCallback, lazy, Suspense} from 'react';
import './App.css';
import Login from './components/Login';
import TourButton from "./components/TourButton";

const Lab1Layout = lazy(() => import('./components/visualisations/Lab1Layout'));
const Lab2Layout = lazy(() => import('./components/visualisations/Lab2Layout'));

const LABS = [
    {id: 'lab1', label: 'Lab 1: Intro to Spark'},
    {id: 'lab2', label: 'Lab 2: DataFrame & ML Pipeline'},
];

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [workspaceUrl, setWorkspaceUrl] = useState(null);
    const [currentLab, setCurrentLab] = useState('lab1');
    const [labData, setLabData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sessionError, setSessionError] = useState(null);
    const [lastExecutedStep, setLastExecutedStep] = useState(null);
    const [runHistory, setRunHistory] = useState([]);
    const [piHistory, setPiHistory] = useState([]);
    const [regHistory, setRegHistory] = useState([]);
    const [splitHistory, setSplitHistory] = useState([]);
    const loadInputRef = useRef(null);

    const apiUrl = import.meta.env.VITE_API_URL || '';

    // Current lab's data
    const data = labData[currentLab] || null;
    const setData = (newData) => {
        setLabData(prev => ({...prev, [currentLab]: newData}));
    };

    const toFiniteNumber = (value) => {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : null;
    };

    const upsertCappedHistory = (prev, entry, keyFn) => {
        const filtered = prev.filter(item => keyFn(item) !== keyFn(entry));
        return [...filtered, entry].slice(-5);
    };

    const refreshSession = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/me`, {
                method: 'GET',
                credentials: 'include',
                headers: {'Accept': 'application/json'}
            });
            if (!res.ok) {
                setIsAuthenticated(false);
                setWorkspaceUrl(null);
                return false;
            }
            const me = await res.json();
            setIsAuthenticated(true);
            setWorkspaceUrl(me.workspaceUrl || null);
            setSessionError(null);
            return true;
        } catch (e) {
            setIsAuthenticated(false);
            setWorkspaceUrl(null);
            return false;
        }
    }, [apiUrl]);

    useEffect(() => {
        refreshSession();
    }, [refreshSession]);

    const handleLoginSuccess = useCallback(async () => {
        await refreshSession();
    }, [refreshSession]);

    const handleLogout = async () => {
        try {
            await fetch(`${apiUrl}/api/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'}
            });
        } catch (e) {
            // even if it fails, clear UI state
        } finally {
            setIsAuthenticated(false);
            setWorkspaceUrl(null);
            setLabData({});
            setRunHistory([]);
            setPiHistory([]);
            setRegHistory([]);
            setSplitHistory([]);
            setError(null);
        }
    };

    const handleLabSwitch = (labId) => {
        setCurrentLab(labId);
        setLastExecutedStep(null);
        setError(null);
        // Data is preserved in labData, switching back shows cached results
    };


    // Receives a parsed trace object from a layout's Load button.
    // Sets data directly, no Spark run needed.
    const handleLoadTrace = (parsed) => {
        let detectedLab = null;

        // Primary: explicit stamp
        if (parsed?._lab === 'lab1' || parsed?._lab === 'lab2') {
            detectedLab = parsed._lab;
        }
        if (!detectedLab) {
            setError('Unrecognised trace file: make sure this JSON was saved from the Lab 1 or Lab 2 "Save Trace" button.');
            return;
        }

        setLabData(prev => ({...prev, [detectedLab]: parsed}));
        setCurrentLab(detectedLab);
        setLastExecutedStep(null);
        setError(null);
    };

    const triggerAnalysis = async ({step, editedCode} = {}) => {
        setLoading(true);
        setError(null);

        const runLab = currentLab;
        const runStart = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min

        try {
            if (step != null) setLastExecutedStep(step);
            const hasEdit = step != null && editedCode && editedCode.trim().length > 0;
            const body = JSON.stringify({
                lab: runLab,
                ...(hasEdit ? {step, editedCode} : {})
            });

            const response = await fetch(`${apiUrl}/trigger`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                signal: controller.signal,
                body,
            });

            if (!response.ok) {
                if (response.status === 401) {
                    setSessionError('Your Databricks access token has expired. Please generate a new token and log in again.');
                    setIsAuthenticated(false);
                    setWorkspaceUrl(null);
                    setLabData({});
                    setRunHistory([]);
                    setPiHistory([]);
                    setRegHistory([]);
                    setSplitHistory([]);
                    return;
                } else if (response.status === 403) {
                    setSessionError('Your token is valid but lacks required Databricks permissions (Unity Catalog/workspace/jobs/clusters).');
                    setIsAuthenticated(false);
                    setWorkspaceUrl(null);
                    setLabData({});
                    setRunHistory([]);
                    setPiHistory([]);
                    setRegHistory([]);
                    setSplitHistory([]);
                    return;
                }
                const errBody = await response.json().catch(() => null);
                setError(errBody?.error || `HTTP error! status: ${response.status}`);
                return;
            }

            const result = await response.json();

            if (result.output && result.output.result) {
                const sparkData = JSON.parse(result.output.result);
                setData(sparkData);

                if (runLab === 'lab1') {
                    const cfg = sparkData?.spark_config ?? {};
                    if (cfg.num_partitions != null) {
                        const entry = {
                            partitions: cfg.num_partitions,
                            skipped: cfg.skip_repartition ?? false,
                            executionSecs: result.executionSeconds ?? null,
                            roundTripSecs: Math.round((Date.now() - runStart) / 1000),
                            timestamp: new Date().toLocaleTimeString(),
                        };
                        setRunHistory(prev => upsertCappedHistory(prev, entry, r => `${r.partitions}`));
                    }
                }

                if (runLab === 'lab2') {
                    const pi = sparkData?.pi_estimation;
                    if (pi && pi.elapsed_ms != null && pi.num_partitions != null && pi.num_samples != null) {
                        const piEntry = {
                            partitions: pi.num_partitions,
                            samples: pi.num_samples,
                            estimate: pi.estimate,
                            error: pi.error ?? Math.abs((pi.estimate ?? 0) - Math.PI),
                            elapsedMs: pi.elapsed_ms,
                            timestamp: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
                        };
                        setPiHistory(prev => upsertCappedHistory(prev, piEntry, r => `${r.partitions}-${r.samples}`));
                    }

                    const lr = sparkData?.linear_regression;
                    const regParam = toFiniteNumber(lr?.reg_param);
                    if (Array.isArray(lr?.coefficients) && Array.isArray(lr?.feature_cols) && regParam != null) {
                        const regEntry = {
                            regParam,
                            coefficients: lr.coefficients,
                            featureCols: lr.feature_cols,
                            testRmse: toFiniteNumber(lr?.test_rmse),
                            timestamp: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
                        };
                        setRegHistory(prev => upsertCappedHistory(prev, regEntry, r => `${r.regParam}`));
                    }

                    const split = sparkData?.train_test_split;
                    if (split && split.seed != null && Array.isArray(split.split_ratio)) {
                        const splitEntry = {
                            seed: split.seed,
                            splitRatio: split.split_ratio,
                            trainCount: split.train_count ?? null,
                            testCount: split.test_count ?? null,
                            actualTrainPct: split.actual_train_pct ?? null,
                            actualTestPct: split.actual_test_pct ?? null,
                            trainSample: split.train_sample ?? [],
                            testSample: split.test_sample ?? [],
                            splitRows: split.split_rows ?? [],
                            timestamp: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}),
                        };
                        setSplitHistory(prev => upsertCappedHistory(
                            prev,
                            splitEntry,
                            r => `${r.seed}-${JSON.stringify(r.splitRatio)}`
                        ));
                    }
                }
            } else {
                if (result.output && result.output.error) {
                    setError(`Notebook execution error: ${result.output.error}`);
                } else {
                    setError(
                        `Unexpected response format. Output field is ${
                            result.output ? 'present but result is missing' : 'missing'
                        }.`
                    );
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                setError('Request timed out after 5 minutes. The Databricks run may still be executing, check your workspace.');
            } else {
                setError(err.message);
            }
            console.error('Error fetching Spark data:', err);
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    };

    if (!isAuthenticated) {
        return <Login sessionError={sessionError} onLoginSuccess={handleLoginSuccess}/>;
    }

    const workspaceLabel = workspaceUrl
        ? workspaceUrl.replace('https://', '').replace('http://', '').split('.')[0]
        : 'Connected';

    return (
        <div className="App">
            <div className="app-header">
                <h1>Interactive Spark Visualisations</h1>
                <div className="header-right">
                    {data && <TourButton currentLab={currentLab} />}
                    <span className="workspace-indicator">{workspaceLabel}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </div>

            <div className="lab-tabs">
                {LABS.map(lab => (
                    <button
                        key={lab.id}
                        onClick={() => handleLabSwitch(lab.id)}
                        disabled={loading}
                        className={`lab-tab ${currentLab === lab.id ? 'lab-tab--active' : ''}`}
                    >
                        {lab.label}
                        {labData[lab.id] && <span className="lab-tab__indicator">●</span>}
                    </button>
                ))}
            </div>

            <div className="results-container">
                <div className="controls">
                    <button
                        onClick={() => triggerAnalysis()}
                        disabled={loading}
                        className="trigger-btn"
                    >
                        {loading ? 'Running Spark Analysis...' : `Run ${LABS.find(l => l.id === currentLab)?.label ?? 'Spark Analysis'}`}
                    </button>
                    <label
                        title="Load a trace you saved from a previous run, opens the full visualisation without running Spark."
                        className="load-trace-btn"
                    >
                        Load Trace
                        <input
                            ref={loadInputRef}
                            type="file"
                            accept=".json"
                            style={{display: 'none'}}
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (evt) => {
                                    try {
                                        const parsed = JSON.parse(evt.target.result);
                                        handleLoadTrace(parsed);
                                    } catch {
                                        setError('Could not read trace file: make sure it is a JSON file saved from this tool.');
                                    }
                                    if (loadInputRef.current) loadInputRef.current.value = '';
                                };
                                reader.readAsText(file);
                            }}
                        />
                    </label>
                </div>

                {error && (
                    <div className="error-box" role="alert" aria-live="assertive" aria-atomic="true">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {currentLab === 'lab1' && data && data.spark_internals && (
                    <Suspense fallback={<div className="results"><div className="section">Loading Lab 1 visualisations…</div></div>}>
                        <div className="results">
                            <Lab1Layout data={data} onExecuteStep={triggerAnalysis} onLoadTrace={handleLoadTrace}
                                        loading={loading}
                                        lastExecutedStep={lastExecutedStep}
                                        runHistory={runHistory}/>
                        </div>
                    </Suspense>
                )}

                {currentLab === 'lab2' && data && (data.dataframe || data.ml_pipeline) && (
                    <Suspense fallback={<div className="results"><div className="section">Loading Lab 2 visualisations…</div></div>}>
                        <div className="results">
                            <Lab2Layout data={data} onExecuteStep={triggerAnalysis} onLoadTrace={handleLoadTrace}
                                        loading={loading}
                                        lastExecutedStep={lastExecutedStep}
                                        piHistory={piHistory}
                                        regHistory={regHistory}
                                        splitHistory={splitHistory}/>
                        </div>
                    </Suspense>
                )}
            </div>
        </div>
    );
}

export default App;

