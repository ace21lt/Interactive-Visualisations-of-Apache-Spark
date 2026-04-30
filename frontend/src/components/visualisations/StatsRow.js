import './Lab2Layout.css';

const StatCell = ({label, value, sub, accent = false}) => (
    <div className="stat-cell">
        <span className="stat-cell-label">{label}</span>
        <span
            className="stat-cell-value"
            style={accent ? {color: 'var(--uos-purple)'} : undefined}
        >
            {value}
        </span>
        {sub && <span className="stat-cell-sub">{sub}</span>}
    </div>
);

const StatsRow = ({currentStep, data}) => {
    const pipeline = data?.spark_internals?.transformation_pipeline ?? [];
    const internals = data?.spark_internals;
    const step = pipeline[currentStep - 1];
    if (!step || !internals) return null;

    let partCount;
    let rowsPerPart;
    let partSub = null;

    if (currentStep === 1) {
        partCount = '1';
        rowsPerPart = `${(step.output_rows ?? 0).toLocaleString()} rows`;
        partSub = 'gzip forces single partition';
    } else if (step.shuffle) {
        const isDayStep = pipeline.slice(0, currentStep - 1).some(s => s.shuffle);
        const dist = isDayStep
            ? (internals.daily_partition_distribution ?? internals.post_shuffle_distribution ?? [])
            : (internals.post_shuffle_distribution ?? []);
        const shuffleForSub = internals.shuffles?.find(s => step.operation?.includes(s.operation));
        const didCoalesce = shuffleForSub &&
            (shuffleForSub.post_shuffle_count ?? 0) < (shuffleForSub.output_distinct_keys ?? Infinity);
        const realCount = isDayStep
            ? (internals.partition_story?.daily_post_shuffle_partitions ?? internals.partition_story?.post_shuffle_partitions ?? dist.length)
            : (internals.partition_story?.post_shuffle_partitions ?? dist.length);
        partCount = String(realCount ?? '-');
        rowsPerPart = realCount != null
            ? `${(step.output_rows ?? 0).toLocaleString()} rows total`
            : '-';
        partSub = didCoalesce
            ? `after AQE coalescing (from ${shuffleForSub.output_distinct_keys} keys)`
            : `${realCount.toLocaleString()} partition(s), one per distinct ${internals?.shuffles?.[0]?.operation?.match(/groupBy\('(.+?)'\)/)?.[1] ?? 'key'}`;
    } else if (step.type === 'action' && !step.shuffle) {
        const dist = internals.filter_partition_distribution ?? internals.partition_distribution ?? [];
        partCount = String(dist.length || '-');
        const avg = dist.length
            ? Math.round(dist.reduce((s, p) => s + p.row_count, 0) / dist.length)
            : 0;
        rowsPerPart = avg ? `~${avg.toLocaleString()} avg/partition` : '-';
        const matchCount = step.output_rows ?? 0;
        partSub = `${matchCount.toLocaleString()} ${matchCount === 1 ? 'row' : 'rows'} matched filter`;
    } else {
        const dist = internals.partition_distribution ?? [];
        partCount = String(dist.length || step.partitions_after || step.partitions || '-');
        const avg = dist.length
            ? Math.round(dist.reduce((s, p) => s + p.row_count, 0) / dist.length)
            : 0;
        rowsPerPart = avg ? `~${avg.toLocaleString()} rows/partition` : '-';
        if (step.partitions_after != null && step.partitions != null && step.partitions !== step.partitions_after) {
            partSub = `${step.partitions} -> ${step.partitions_after} partitions (shuffle)`;
        } else if (step.lazy) {
            partSub = 'partition state unchanged, no execution yet';
        }
    }

    let shuffleContent;

    if (step.shuffle) {
        const shuffleEntry = internals.shuffles?.find(s =>
            step.operation?.includes(s.operation)
        );
        const requested = shuffleEntry?.partitions_write ?? step.partitions_write ?? '?';
        const coalesced = shuffleEntry?.post_shuffle_count ?? step.partitions_after ?? step.partitions_write ?? step.partitions_read ?? '?';

        shuffleContent = (
            <div className="stats-row-content">
                <StatCell
                    label="Shuffle partitions requested"
                    value={String(requested)}
                    sub="spark.sql.shuffle.partitions default"
                />
                <StatCell label="Partitions" value={String(coalesced)} />
                {shuffleEntry?.reason && (
                    <StatCell label="Reason" value="" sub={shuffleEntry.reason} />
                )}
            </div>
        );
    } else if (step.partitions_after != null) {
        shuffleContent = (
            <div className="stats-row-content">
                <StatCell label="Before" value={String(step.partitions ?? 1)} sub="partitions" />
                <span className="stats-row-arrow">→</span>
                <StatCell label="After" value={String(step.partitions_after)} sub="partitions" accent />
                <StatCell label="Type" value="WIDE" sub="full shuffle across network" />
            </div>
        );
    } else {
        shuffleContent = (
            <div className="stats-row-success">
                <span className="stats-row-success-icon">✓</span>
                <div>
                    <div className="stats-row-success-title">No network I/O</div>
                    <div className="stats-row-success-sub">
                        {step.lazy
                            ? 'Narrow transformation: predicate added to DAG, no data moved'
                            : 'Result computed locally on each partition'
                        }
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="stats-row">
            <div className="stats-row-card">
                <div className="stats-row-header">Partitions &amp; Rows</div>
                <div className="stats-row-content">
                    <StatCell label="Partition count" value={partCount} sub={partSub} accent />
                    <StatCell label="Row distribution" value={rowsPerPart} />
                </div>
            </div>

            <div className="stats-row-card">
                <div className="stats-row-header">Shuffle / Execution Type</div>
                {shuffleContent}
            </div>
        </div>
    );
};

export default StatsRow;
