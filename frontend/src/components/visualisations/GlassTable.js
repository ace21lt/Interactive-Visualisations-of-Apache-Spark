//Shared table renderer used across all Lab 2 steps
function GlassTable({title, badge, columns, rows, maxRows = 10}) {
    if (!rows || rows.length === 0) return null;
    const display = rows.slice(0, maxRows);
    return (<div style={{
        border: '1px solid var(--grey-300)',
        borderRadius: '6px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column'
    }}>
        <div style={{
            background: 'var(--grey-50)',
            padding: '12px 16px',
            borderBottom: '2px solid var(--uos-purple)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
                <span style={{
                    fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--grey-900)'
                }}>
                    {title}
                </span>
            {badge && (<span style={{
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '4px',
                background: '#f0e6ff',
                color: '#440099'
            }}>{badge}</span>)}
        </div>
        <div style={{overflowX: 'auto'}}>
            <table style={{
                width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)'
            }}>
                <thead>
                <tr>{columns.map(c => (<th key={c} style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--grey-300)',
                    background: 'var(--grey-50)',
                    fontWeight: 'bold',
                    fontSize: '11px',
                    color: 'var(--grey-600)',
                    whiteSpace: 'nowrap'
                }}>{c}</th>))}</tr>
                </thead>
                <tbody>
                {display.map((row, i) => (<tr key={i} style={{borderBottom: '1px solid var(--grey-200)'}}>
                    {columns.map(c => (<td key={c} style={{
                        padding: '6px 12px', color: 'var(--grey-800)', whiteSpace: 'nowrap'
                    }}>
                        {typeof row[c] === 'number' ? row[c].toFixed(4) : Array.isArray(row[c]) ? `[${row[c].map(v => typeof v === 'number' ? v.toFixed(1) : v).join(', ')}]` : String(row[c] ?? '—')}
                    </td>))}
                </tr>))}
                </tbody>
            </table>
        </div>
        {rows.length > maxRows && (<div style={{
            padding: '6px 12px',
            fontSize: '11px',
            color: 'var(--grey-400)',
            borderTop: '1px solid var(--grey-200)'
        }}>
            Showing {maxRows} of {rows.length} rows
        </div>)}
    </div>);
}

export default GlassTable;