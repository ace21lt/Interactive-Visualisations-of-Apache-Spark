import './Lab2Layout.css';

export function StatCell({label, value, accent = false}) {
    return (
        <div className="stat-cell">
            <span className="stat-cell-label">{label}</span>
            <span
                className="stat-cell-value"
                style={accent ? {color: 'var(--uos-purple)'} : undefined}
            >
                {value}
            </span>
        </div>
    );
}

export function StatsCard({children}) {
    return (
        <div className="stat-group">
            {children}
        </div>
    );
}