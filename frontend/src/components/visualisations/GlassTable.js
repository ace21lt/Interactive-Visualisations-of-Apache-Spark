import './Lab2Layout.css';

function GlassTable({title, badge, columns, rows, maxRows = 10}) {
    if (!rows || rows.length === 0) return null;
    const display = rows.slice(0, maxRows);
    return (
        <div className="glass-table">
            <div className="glass-table-header">
                <span className="glass-table-title">{title}</span>
                {badge && <span className="badge badge--lazy">{badge}</span>}
            </div>
            <div className="glass-table-body">
                <table className="glass-table-table">
                    <thead>
                        <tr className="glass-table-row--header">
                            {columns.map(c => (
                                <th key={c} className="glass-table-cell">{c}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {display.map((row, i) => (
                            <tr key={i} className="glass-table-row">
                                {columns.map(c => (
                                    <td key={c} className="glass-table-cell">
                                        {typeof row[c] === 'number'
                                            ? row[c].toFixed(4)
                                            : Array.isArray(row[c])
                                                ? `[${row[c].map(v => typeof v === 'number' ? v.toFixed(1) : v).join(', ')}]`
                                                : String(row[c] ?? '—')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length > maxRows && (
                <div className="glass-table-footer">
                    Showing {maxRows} of {rows.length} rows
                </div>
            )}
        </div>
    );
}

export default GlassTable;
