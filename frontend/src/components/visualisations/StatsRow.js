import React from 'react';

// Stat cell
const StatCell = ({label, value, sub, accent = false}) => (
    <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
        <span style={{fontSize: '10px', color: 'var(--grey-500)', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
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
        {sub && (
            <span style={{fontSize: '10px', color: 'var(--grey-500)'}}>{sub}</span>
        )}
    </div>
);

// StatsRow
// Left card: partition count and row distribution.
// Right card: shuffle info or "no shuffle" message.
const StatsRow = ({currentStep, data}) => {
    const pipeline = data?.spark_internals?.transformation_pipeline ?? [];
    const internals = data?.spark_internals;
    const step = pipeline[currentStep - 1];
    if (!step || !internals) return null;

    // Partition card
    let partCount = '—';
    let rowsPerPart = '—';
    let partSub = null;

    if (currentStep === 1) {
        partCount = '1';
        rowsPerPart = `${(step.output_rows ?? 0).toLocaleString()} rows`;
        partSub = 'gzip forces single partition';
    } else if (step.shuffle) {
        // Post-shuffle: read distribution length from internals
        const isDayStep = pipeline.slice(0, currentStep - 1).some(s => s.shuffle);
        const dist = isDayStep
            ? (internals.daily_partition_distribution ?? internals.post_shuffle_distribution ?? [])
            : (internals.post_shuffle_distribution ?? []);
        const shuffleForSub = internals.shuffles?.find(s => step.operation?.includes(s.operation));
        const didCoalesce = shuffleForSub &&
            (shuffleForSub.post_shuffle_count ?? 0) < (shuffleForSub.output_distinct_keys ?? Infinity);
        // Use partition_story for the real total — dist may be capped at serialisation time
        const realCount = isDayStep
            ? (internals.partition_story?.daily_post_shuffle_partitions ?? internals.partition_story?.post_shuffle_partitions ?? dist.length)
            : (internals.partition_story?.post_shuffle_partitions ?? dist.length);
        partCount = String(realCount ?? '—');
        rowsPerPart = realCount != null
            ? `${(step.output_rows ?? 0).toLocaleString()} rows total`
            : '—';
        partSub = didCoalesce
            ? `after AQE coalescing (from ${shuffleForSub.output_distinct_keys} keys)`
            : `${realCount.toLocaleString()} partition(s) — one per distinct ${internals?.shuffles?.[0]?.operation?.match(/groupBy\('(.+?)'\)/)?.[1] ?? 'key'}`;
    } else if (step.type === 'action' && !step.shuffle) {
        const dist = internals.filter_partition_distribution ?? internals.partition_distribution ?? [];
        partCount = String(dist.length || '—');
        const avg = dist.length
            ? Math.round(dist.reduce((s, p) => s + p.row_count, 0) / dist.length)
            : 0;
        rowsPerPart = avg ? `~${avg.toLocaleString()} avg/partition` : '—';
        const matchCount = step.output_rows ?? 0;
        partSub = `${matchCount.toLocaleString()} ${matchCount === 1 ? 'row' : 'rows'} matched filter`;
    } else {
        // Lazy transformations: use partition_distribution
        const dist = internals.partition_distribution ?? [];
        partCount = String(dist.length || step.partitions_after || step.partitions || '—');
        const avg = dist.length
            ? Math.round(dist.reduce((s, p) => s + p.row_count, 0) / dist.length)
            : 0;
        rowsPerPart = avg ? `~${avg.toLocaleString()} rows/partition` : '—';
        if (step.partitions_after != null && step.partitions != null && step.partitions !== step.partitions_after) {
            partSub = `${step.partitions} -> ${step.partitions_after} partitions (shuffle)`;
        } else if (step.lazy) {
            partSub = 'partition state unchanged — no execution yet';
        }
    }

    // Shuffle card
    let shuffleContent;

    if (step.shuffle) {
        // Find matching shuffle entry — tolerant of operation label variations
        const shuffleEntry = internals.shuffles?.find(s =>
            step.operation?.includes(s.operation)
        );

        const requested = shuffleEntry?.partitions_write ?? step.partitions_write ?? '?';
        const coalesced = shuffleEntry?.post_shuffle_count ?? step.partitions_after ?? step.partitions_write ?? step.partitions_read ?? '?';

        shuffleContent = (
            <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap'}}>
                <StatCell
                    label="Shuffle partitions requested"
                    value={String(requested)}
                    sub="spark.sql.shuffle.partitions default"
                />
                <StatCell
                    label="Partitions"
                    value={String(coalesced)}
                />
                {shuffleEntry?.reason && (
                    <StatCell
                        label="Reason"
                        value=""
                        sub={shuffleEntry.reason}
                    />
                )}
            </div>
        );
    } else if (step.partitions_after != null) {
        // Repartition step
        shuffleContent = (
            <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap'}}>
                <StatCell label="Before" value={String(step.partitions ?? 1)} sub="partitions"/>
                <span style={{alignSelf: 'center', fontSize: '20px', color: 'var(--grey-400)'}}>{'->'}</span>
                <StatCell label="After" value={String(step.partitions_after)} sub="partitions" accent/>
                <StatCell label="Type" value="WIDE" sub="full shuffle across network"/>
            </div>
        );
    } else {
        // Narrow / lazy
        shuffleContent = (
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#16a34a'}}>
                <span style={{fontSize: '18px'}}>✓</span>
                <div>
                    <div style={{fontWeight: 'bold', fontSize: '13px'}}>No network I/O</div>
                    <div style={{fontSize: '11px', color: 'var(--grey-500)'}}>
                        {step.lazy
                            ? 'Narrow transformation — predicate added to DAG, no data moved'
                            : 'Result computed locally on each partition'
                        }
                    </div>
                </div>
            </div>
        );
    }

    const cardStyle = {
        flex: 1, border: '1px solid var(--grey-200)', borderRadius: '6px',
        padding: '14px 16px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px'
    };
    const cardHeaderStyle = {
        fontSize: '11px', fontWeight: 'bold', color: 'var(--grey-500)',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        paddingBottom: '8px', borderBottom: '1px solid var(--grey-200)'
    };

    return (
        <div style={{display: 'flex', gap: '10px'}}>

            {/* Left: Partitions */}
            <div style={cardStyle}>
                <div style={cardHeaderStyle}>Partitions &amp; Rows</div>
                <div style={{display: 'flex', gap: '24px', flexWrap: 'wrap'}}>
                    <StatCell label="Partition count" value={partCount} sub={partSub} accent/>
                    <StatCell label="Row distribution" value={rowsPerPart}/>
                </div>
            </div>

            {/* Right: Shuffle */}
            <div style={cardStyle}>
                <div style={cardHeaderStyle}>Shuffle / Execution Type</div>
                {shuffleContent}
            </div>

        </div>
    );
};

export default StatsRow;