//Stat cell — single labelled metric used inside StatsCard
export function StatCell({label, value, accent = false}) {
    return (<div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
            <span style={{
                fontSize: '10px', color: 'var(--grey-500)', textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
                {label}
            </span>
        <span style={{
            fontSize: '15px',
            fontWeight: 'bold',
            color: accent ? 'var(--uos-purple)' : 'var(--grey-900)',
            fontFamily: 'var(--font-mono)'
        }}>
                {value}
            </span>
    </div>);
}

//StatsCard — horizontal strip of StatCell metrics
export function StatsCard({children}) {
    return (<div style={{
        display: 'flex',
        gap: '24px',
        flexWrap: 'wrap',
        border: '1px solid var(--grey-200)',
        padding: '14px 16px',
        borderRadius: '6px',
        background: '#fff'
    }}>
        {children}
    </div>);
}