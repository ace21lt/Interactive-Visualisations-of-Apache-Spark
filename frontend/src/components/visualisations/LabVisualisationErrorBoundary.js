import React from 'react';

class LabVisualisationErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {hasError: false, error: null};
    }

    static getDerivedStateFromError(error) {
        return {hasError: true, error};
    }

    componentDidCatch(error, info) {
        // Keep details for debugging while preserving UI continuity.
        // eslint-disable-next-line no-console
        console.error('Lab visualisation render error:', error, info);
    }

    render() {
        if (this.state.hasError) {
            const {title, requiredFields = []} = this.props;
            const fieldText = requiredFields.length > 0
                ? `Required notebook fields: ${requiredFields.join(', ')}`
                : 'Required notebook fields are missing or malformed.';

            return (
                <div style={{
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    background: '#fff1f2',
                    color: '#9f1239',
                    padding: '12px 14px',
                    marginBottom: '10px'
                }}>
                    <div style={{
                        fontSize: '12px',
                        fontWeight: 'bold',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '6px'
                    }}>
                        {title || 'Visualisation unavailable'}
                    </div>
                    <div style={{fontSize: '11px', lineHeight: 1.5}}>
                        {fieldText}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default LabVisualisationErrorBoundary;

