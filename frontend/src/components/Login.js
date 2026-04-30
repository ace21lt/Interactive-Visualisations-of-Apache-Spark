import React, {useState} from 'react';
import './Login.css';

const Login = ({sessionError = null, onLoginSuccess}) => {
    const [workspaceUrl, setWorkspaceUrl] = useState('');
    const [token, setToken] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(sessionError);

    const validateUrl = (url) => {
        const u = url.trim();
        return (
            u.startsWith('https://')
        ) && (
            u.includes('.databricks.com')
        );
    };

    const validateToken = (t) => {
        const v = (t || '').trim();
        return v.length >= 10 && v.startsWith('dapi');
    };

    const apiBase = import.meta.env.VITE_API_URL || '';
    const errorId = 'login-error-message';

    const handleConnect = async () => {
        const cleanUrl = workspaceUrl.trim().replace(/\/+$/, '');
        const cleanToken = token.trim();

        if (!cleanUrl) return setError('Please enter your Databricks workspace URL');
        if (!validateUrl(cleanUrl)) return setError('Please enter a valid Databricks workspace URL');
        if (!cleanToken) return setError('Please enter a Databricks Personal Access Token (PAT)');
        if (!validateToken(cleanToken)) return setError('Token format looks wrong (it should start with "dapi".)');

        setError(null);
        setIsLoading(true);

        try {
            const res = await fetch(`${apiBase}/api/login`, {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({workspaceUrl: cleanUrl, token: cleanToken})
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                setError(text || `Login failed (HTTP ${res.status})`);
                return;
            }

            await onLoginSuccess?.();
        } catch (e) {
            setError(e.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <div className="login-container">
            <div className="login-page-body">
                <div className="login-card">
                    <div className="login-header">
                        <div className="title">
                            <h1>Spark Visualisations</h1>
                        </div>
                        <p className="tagline">Interactive Visualisation Tool for Teaching Scalable Machine Learning on
                            Apache Spark</p>
                    </div>

                    <div className="login-form">
                        <div className="form-step">
                            <div className="input-group">
                                <label htmlFor="workspace-url">
                                    <span className="label-icon"></span>
                                    Databricks Workspace URL
                                </label>
                                <input
                                    id="workspace-url"
                                    type="url"
                                    value={workspaceUrl}
                                    onChange={(e) => setWorkspaceUrl(e.target.value)}
                                    placeholder="https://your-workspace.cloud.databricks.com"
                                    autoFocus
                                    autoComplete="off"
                                    disabled={isLoading}
                                />
                                <p className="input-hint">
                                    Copy this from your Databricks browser URL.
                                </p>
                            </div>

                            <div className="input-group">
                                <label htmlFor="pat-token">
                                    <span className="label-icon"></span>
                                    Personal Access Token (PAT)
                                </label>
                                <input
                                    id="pat-token"
                                    type="password"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="dapi..."
                                    autoComplete="one-time-code"
                                    disabled={isLoading}
                                />
                                <p className="input-hint">
                                    Stored only in server memory for your session, never written to a database.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleConnect}
                                disabled={isLoading}
                                aria-describedby={error ? errorId : undefined}
                            >
                                {isLoading ? (
                                    <>
                                        <span className="spinner"></span>
                                        Connecting...
                                    </>
                                ) : (
                                    <>
                                        Connect
                                        <span className="btn-arrow">&rarr;</span>
                                    </>
                                )}
                            </button>

                            {error && (
                                <div className="error-message" id={errorId} role="alert" aria-live="assertive" aria-atomic="true">
                                    <span className="error-icon"></span>
                                    {error}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="security-note">
                        <span className="security-icon"></span>
                        <p>
                            You can revoke your PAT anytime in Databricks. Logging out clears it from this app.
                        </p>
                    </div>

                    <div className="help-section">
                        <details className="help-dropdown">
                            <summary>Where do I find my workspace URL?</summary>
                            <ol>
                                <li>Open your Databricks workspace in a browser</li>
                                <li>Copy the URL from the address bar</li>
                                <li>Paste it here (e.g. <code>https://dbc-....cloud.databricks.com</code>)</li>
                            </ol>
                        </details>
                        <details className="help-dropdown">
                            <summary>Where do I create a PAT?</summary>
                            <ol>
                                <li>In Databricks: click your profile icon</li>
                                <li>Go to <strong>Settings</strong> &gt; <strong>Developer</strong></li>
                                <li>Click <strong>Manage</strong> next to <strong>Access tokens</strong></li>
                                <li>Name the token and set an expiration (e.g. <strong>90 days</strong>)</li>
                                <li>Set API scope(s) to <strong>jobs, workspace, files, unity-catalog and clusters</strong></li>
                                <li>Generate a token and <strong>make a note of it</strong> because you will not be able to view it again.</li>
                                <li>Paste it here</li>
                            </ol>
                        </details>
                    </div>
                </div>
            </div>
        </div>)


};

export default Login;