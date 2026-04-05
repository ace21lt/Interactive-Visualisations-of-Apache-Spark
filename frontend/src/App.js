import React, {useState, useEffect, useRef} from 'react';
import './App.css';
import Login from './components/Login';
import Lab1Layout from "./components/visualisations/Lab1Layout";

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [workspaceUrl, setWorkspaceUrl] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sessionError, setSessionError] = useState(null);
    const [lastExecutedStep, setLastExecutedStep] = useState(null);
    const [runHistory, setRunHistory] = useState([]);
    const loadInputRef = useRef(null);

    const apiUrl = process.env.REACT_APP_API_URL || '';

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
            setData(null);
            setError(null);
        }
    };


    // Receives a parsed trace object from Lab1Layout's Load button.
    // Sets data directly — no Spark run needed.
    const handleLoadTrace = (parsed) => {
        if (!parsed?.spark_internals) return;
        setData(parsed);
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
            const body = hasEdit ? JSON.stringify({step, editedCode}) : undefined;

            const response = await fetch(`${apiUrl}/trigger`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                signal: controller.signal,
                ...(body ? {body} : {}),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid — clear session and return to login screen
                    setSessionError('Your Databricks access token has expired. Please generate a new token and log in again.');
                    setIsAuthenticated(false);
                    setWorkspaceUrl(null);
                    setData(null);
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
                        // Keep latest entry per partition count
                        const filtered = prev.filter(r => r.partitions !== entry.partitions);
                        return [...filtered, entry].slice(-8);
                    });
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

            <div className="results-container" style={{maxWidth: "1280px", margin: "0 auto", padding: "0 32px"}}>
                <div className="controls">
                    <button
                        onClick={() => triggerAnalysis()}
                        disabled={loading}
                        className="trigger-btn"
                    >
                        {loading ? 'Running Spark Analysis...' : 'Run Spark Analysis'}
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

                {data && data.spark_internals && (
                    <div className="results">
                        <Lab1Layout data={data} onExecuteStep={triggerAnalysis} onLoadTrace={handleLoadTrace}
                                    loading={loading}
                                    lastExecutedStep={lastExecutedStep} runHistory={runHistory}/>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;