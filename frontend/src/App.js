import React, {useState, useEffect, useRef} from 'react';
import './App.css';
import Login from './components/Login';
import Lab1Layout from "./components/visualisations/Lab1Layout";
import Lab2Layout from "./components/visualisations/Lab2Layout";

const LABS = [
    {id: 'lab1', label: 'Lab 1 — Intro to Spark'},
    {id: 'lab2', label: 'Lab 2 — DataFrame & ML Pipeline'},
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
    const loadInputRef = useRef(null);

    const apiUrl = import.meta.env.VITE_API_URL || '';

    // Current lab's data
    const data = labData[currentLab] || null;
    const setData = (newData) => {
        setLabData(prev => ({...prev, [currentLab]: newData}));
    };

    useEffect(() => {
        const checkSession = async () => {
            try {
                const res = await fetch(`${apiUrl}/api/me`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {'Accept': 'application/json'}
                });
                if (!res.ok) {
                    setIsAuthenticated(false);
                    setWorkspaceUrl(null);
                    return;
                }
                const me = await res.json();
                setIsAuthenticated(true);
                setWorkspaceUrl(me.workspaceUrl || null);
                setSessionError(null);
            } catch (e) {
                setIsAuthenticated(false);
                setWorkspaceUrl(null);
            }
        };
        checkSession();
    }, [apiUrl]);

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
            setError(null);
        }
    };

    const handleLabSwitch = (labId) => {
        setCurrentLab(labId);
        setLastExecutedStep(null);
        setError(null);
        // Data is preserved in labData — switching back shows cached results
    };


    // Receives a parsed trace object from a layout's Load button.
    // Sets data directly — no Spark run needed.
    const handleLoadTrace = (parsed) => {
        let detectedLab = null;

        // Primary: explicit stamp
        if (parsed?._lab === 'lab1' || parsed?._lab === 'lab2') {
            detectedLab = parsed._lab;
        }
        if (!detectedLab) {
            setError('Unrecognised trace file — make sure this JSON was saved from the Lab 1 or Lab 2 "Save Trace" button.');
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

        const _runStart = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min

        try {
            if (step != null) setLastExecutedStep(step);
            const hasEdit = step != null && editedCode && editedCode.trim().length > 0;
            const body = JSON.stringify({
                lab: currentLab,
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
                    return;
                }
                else if (response.status === 403) {
                    setSessionError('Your token is valid but lacks required Databricks permissions (Unity Catalog/workspace/jobs/clusters).');
                    setIsAuthenticated(false);
                    setWorkspaceUrl(null);
                    setLabData({});
                    return;
                }
                const errBody = await response.json().catch(() => null);
                throw new Error(errBody?.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Raw response:', result);

            if (result.output && result.output.result) {
                const sparkData = JSON.parse(result.output.result);
                console.log('Parsed Spark data:', sparkData);
                setData(sparkData);

                // Run history tracking
                if (currentLab === 'lab1') {
                    const cfg = sparkData?.spark_config ?? {};
                    if (cfg.num_partitions != null) {
                        const entry = {
                            partitions: cfg.num_partitions,
                            skipped: cfg.skip_repartition ?? false,
                            executionSecs: result.executionSeconds ?? null,
                            roundTripSecs: Math.round((Date.now() - _runStart) / 1000),
                            timestamp: new Date().toLocaleTimeString(),
                        };
                        setRunHistory(prev => {
                            const filtered = prev.filter(r => r.partitions !== entry.partitions);
                            return [...filtered, entry].slice(-8);
                        });
                    }
                }
            } else {
                const errorDetails = {
                    hasOutput: !!result.output,
                    hasResult: !!(result.output && result.output.result),
                    hasError: !!(result.output && result.output.error),
                    outputStructure: result.output ? Object.keys(result.output) : 'N/A'
                };
                console.error('Response structure:', errorDetails);
                console.error('Full response:', result);
                if (result.output && result.output.error) {
                    throw new Error(`Notebook execution error: ${result.output.error}`);
                } else {
                    throw new Error(
                        `Unexpected response format. Output field is ${
                            result.output ? 'present but result is missing' : 'missing'
                        }. Check console for details.`
                    );
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                setError('Request timed out after 5 minutes. The Databricks run may still be executing — check your workspace.');
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
        return <Login sessionError={sessionError}/>;
    }

    const workspaceLabel = workspaceUrl
        ? workspaceUrl.replace('https://', '').replace('http://', '').split('.')[0]
        : 'Connected';

    return (
        <div className="App">
            <div className="app-header">
                <h1>Interactive Spark Visualisations</h1>
                <div className="header-right">
                    <span className="workspace-indicator">{workspaceLabel}</span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </div>

            {/* Lab selector tabs */}
            <div style={{
                maxWidth: '1280px', margin: '0 auto', padding: '16px 32px 0',
                display: 'flex', gap: '0', borderBottom: '2px solid #e0e0e0'
            }}>
                {LABS.map(lab => (
                    <button
                        key={lab.id}
                        onClick={() => handleLabSwitch(lab.id)}
                        disabled={loading}
                        style={{
                            padding: '10px 24px',
                            background: currentLab === lab.id ? 'var(--uos-purple, #440099)' : 'transparent',
                            color: currentLab === lab.id ? '#fff' : '#555',
                            border: 'none',
                            borderBottom: currentLab === lab.id ? '3px solid var(--uos-purple, #440099)' : '3px solid transparent',
                            cursor: loading ? 'wait' : 'pointer',
                            fontWeight: currentLab === lab.id ? 'bold' : 'normal',
                            fontSize: '14px',
                            marginBottom: '-2px',
                            borderRadius: '6px 6px 0 0',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {lab.label}
                        {labData[lab.id] && <span style={{marginLeft: '6px', opacity: 0.6}}>●</span>}
                    </button>
                ))}
            </div>

            <div className="results-container" style={{maxWidth: "1280px", margin: "0 auto", padding: "0 32px"}}>
                <div className="controls">
                    <button
                        onClick={() => triggerAnalysis()}
                        disabled={loading}
                        className="trigger-btn"
                    >
                        {loading ? 'Running Spark Analysis...' : `Run ${LABS.find(l => l.id === currentLab)?.label ?? 'Spark Analysis'}`}
                    </button>
                    <label
                        title="Load a trace you saved from a previous run — opens the full visualisation without running Spark."
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
                                        setError('Could not read trace file — make sure it is a JSON file saved from this tool.');
                                    }
                                    if (loadInputRef.current) loadInputRef.current.value = '';
                                };
                                reader.readAsText(file);
                            }}
                        />
                    </label>
                </div>

                {error && (
                    <div className="error-box">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {/* Lab 1 */}
                {currentLab === 'lab1' && data && data.spark_internals && (
                    <div className="results">
                        <Lab1Layout data={data} onExecuteStep={triggerAnalysis} onLoadTrace={handleLoadTrace}
                                    loading={loading}
                                    lastExecutedStep={lastExecutedStep} runHistory={runHistory}/>
                    </div>
                )}

                {/* Lab 2 */}
                {currentLab === 'lab2' && data && (data.dataframe || data.ml_pipeline) && (
                    <div className="results">
                        <Lab2Layout data={data} onExecuteStep={triggerAnalysis} onLoadTrace={handleLoadTrace}
                                    loading={loading}
                                    lastExecutedStep={lastExecutedStep}/>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;