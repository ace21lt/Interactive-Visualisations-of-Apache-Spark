import React, { useState } from 'react';
import './App.css';

function App() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const triggerAnalysis = async () => {
        setLoading(true);
        setError(null);

        try {
            // Call your Scala backend
            const response = await fetch('http://localhost:8080/trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Raw response:', result);

            // Parse the nested JSON - output.result is a JSON string!
            if (result.output && result.output.result) {
                const sparkData = JSON.parse(result.output.result);
                console.log('Parsed Spark data:', sparkData);
                setData(sparkData);
            } else {
                throw new Error('Unexpected response format');
            }
        } catch (err) {
            setError(err.message);
            console.error('Error fetching Spark data:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="App">
            <header className="app-header">
                <h1>Interactive Spark Visualisations</h1>
            </header>

            <div className="controls">
                <button
                    onClick={triggerAnalysis}
                    disabled={loading}
                    className="trigger-btn"
                >
                    {loading ? 'Running Spark Analysis...' : 'Run Spark Analysis'}
                </button>
            </div>

            {error && (
                <div className="error-box">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {loading && (
                <div className="loading-box">
                    <div className="spinner"></div>
                    <p>Executing Spark job on Databricks...</p>
                    <p className="subtext">This may take a little while</p>
                </div>
            )}

            {data && (
                <div className="results">
                    <h2>Analysis Complete!</h2>

                    {/* Quick Stats Summary */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <h3>Total Records</h3>
                            <p className="stat-value">
                                {data.filter_results?.total ? data.filter_results.total.toLocaleString() : 'N/A'}
                            </p>
                        </div>
                        <div className="stat-card">
                            <h3>Unique Hosts</h3>
                            <p className="stat-value">
                                {data.metrics?.unique_hosts_total ? data.metrics.unique_hosts_total.toLocaleString() : 'N/A'}
                            </p>
                        </div>
                        <div className="stat-card">
                            <h3>404 Errors</h3>
                            <p className="stat-value">
                                {data.filter_results?.errors_404 ? data.filter_results.errors_404.toLocaleString() : 'N/A'}
                            </p>
                        </div>
                        <div className="stat-card">
                            <h3>Top Host</h3>
                            <p className="stat-value">{data.top_host?.host || 'N/A'}</p>
                            <p className="subtext">
                                {data.top_host?.requests ? `${data.top_host.requests.toLocaleString()} requests` : '0 requests'}
                            </p>
                        </div>
                    </div>

                    {/* Spark Internals Section */}
                    {data.spark_internals && (
                        <div className="spark-internals">
                            <h2>Spark Internals</h2>

                            {/* Partition Info */}
                            {data.spark_internals.partition_distribution && (
                                <div className="section">
                                    <h3>Partition Distribution</h3>
                                    <pre>{JSON.stringify(data.spark_internals.partition_distribution, null, 2)}</pre>
                                    <p className="explanation">
                                        All data is in 1 partition! This means no parallelism.
                                    </p>
                                </div>
                            )}

                            {/* Transformation Pipeline */}
                            {data.spark_internals.transformation_pipeline && (
                                <div className="section">
                                    <h3>Transformation Pipeline ({data.spark_internals.transformation_pipeline.length} steps)</h3>
                                    <div className="pipeline">
                                        {data.spark_internals.transformation_pipeline.map((step, idx) => (
                                            <div
                                                key={idx}
                                                className={`pipeline-step ${step.lazy ? 'lazy' : 'action'}`}
                                            >
                                                <div className="step-number">{step.step}</div>
                                                <div className="step-info">
                                                    <strong>{step.operation}</strong>
                                                    <p>{step.description}</p>
                                                    {step.output_rows && <span className="badge">{step.output_rows.toLocaleString()} rows</span>}
                                                    {step.shuffle && <span className="badge shuffle">Shuffle</span>}
                                                    {step.lazy ? <span className="badge lazy">💤 Lazy</span> : <span className="badge action">⚡ Action</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Shuffles */}
                            {data.spark_internals.shuffles && (
                                <div className="section">
                                    <h3>Shuffle Operations ({data.spark_internals.shuffles.length})</h3>
                                    {data.spark_internals.shuffles.map((shuffle, idx) => (
                                        <div key={idx} className="shuffle-info">
                                            <h4>{shuffle.operation}</h4>
                                            <p>{shuffle.reason}</p>
                                            <p>{shuffle.partitions_read} partitions → {shuffle.partitions_write} partitions</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Stages */}
                            {data.spark_internals.stages && (
                                <div className="section">
                                    <h3>Execution Stages ({data.spark_internals.stages.length})</h3>
                                    <div className="stages">
                                        {data.spark_internals.stages.map((stage, idx) => (
                                            <div key={idx} className={`stage ${stage.shuffle ? 'with-shuffle' : 'no-shuffle'}`}>
                                                <div className="stage-id">Stage {stage.stage_id}</div>
                                                <div className="stage-details">
                                                    <strong>{stage.name}</strong>
                                                    <p>{stage.operations.join(', ')}</p>
                                                    {stage.shuffle && <span className="badge">Shuffle</span>}
                                                    {stage.rows_processed && <span>{stage.rows_processed.toLocaleString()} rows</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Status Distribution */}
                    {data.status_distribution && (
                        <div className="section">
                            <h3>HTTP Status Code Distribution</h3>
                            <div className="status-list">
                                {data.status_distribution.map((status, idx) => (
                                    <div key={idx} className="status-row">
                                        <span className="status-code">{status.status}</span>
                                        <span className="status-count">{status.count?.toLocaleString() || '0'}</span>
                                        <div className="bar" style={{width: `${data.filter_results?.total ? (status.count / data.filter_results.total) * 100 : 0}%`}}></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default App;
