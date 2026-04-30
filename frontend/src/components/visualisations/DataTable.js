import React from 'react';

//Badge
const Badge = ({type}) => {
    const styles = {
        action: {bg: '#e8f5e9', color: '#1b5e20', border: '#c8e6c9', text: 'ACTION'},
        lazy: {bg: '#fff3e0', color: '#e65100', border: '#ffe0b2', text: 'LAZY TRANSFORMATION'},
        shuffle: {bg: '#fce4ec', color: '#880e4f', border: '#f8bbd0', text: 'SHUFFLE (WIDE)'},
    };
    const s = styles[type] || styles.lazy;
    return (
        <span style={{
            background: s.bg, color: s.color, border: `1px solid ${s.border}`,
            padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
            fontWeight: 'bold', marginLeft: '8px'
        }}>
            {s.text}
        </span>
    );
};

//Cross-filter banner
const CrossFilterBanner = ({partitionId}) => (
    <div style={{
        background: '#fffbeb', padding: '8px 12px', borderRadius: '4px',
        fontSize: '12px', color: '#b45309', border: '1px solid #fcd34d',
        fontWeight: 'bold', marginBottom: '4px'
    }}>
        Showing Partition {partitionId} only, click the same partition again to reset
    </div>
);

//Shared table wrapper
const GlassBoxTable = ({title, badge, explanation, columns, rows, highlightCol = null, emptyMessage = null}) => (
    <div style={{
        border: '1px solid var(--grey-300)', borderRadius: '6px',
        overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column'
    }}>
        <div style={{background: 'var(--grey-50)', padding: '12px 16px', borderBottom: '2px solid var(--uos-purple)'}}>
            <div style={{display: 'flex', alignItems: 'center', marginBottom: '6px'}}>
                <span style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: 'var(--grey-900)',
                    fontFamily: 'var(--font-mono)'
                }}>
                    {title}
                </span>
                {badge && <Badge type={badge}/>}
            </div>
            <div style={{fontSize: '12px', color: 'var(--grey-700)', lineHeight: '1.4'}}>
                {explanation}
            </div>
        </div>

        {rows.length === 0 && emptyMessage ? (
            <div style={{
                padding: '20px 16px',
                textAlign: 'center',
                color: '#999',
                fontStyle: 'italic',
                fontSize: '13px'
            }}>
                {emptyMessage}
            </div>
        ) : (
            <div style={{overflowX: 'auto'}}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'left'
                }}>
                    <thead>
                    <tr style={{background: 'var(--grey-200)'}}>
                        {columns.map((col, idx) => (
                            <th key={col} style={{
                                padding: '8px 12px', borderBottom: '1px solid var(--grey-300)',
                                color: 'var(--grey-900)',
                                background: highlightCol === idx ? '#f0e6ff' : 'transparent'
                            }}>
                                {col}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}
                            style={{borderBottom: '1px solid #efefef', background: i % 2 === 0 ? '#fff' : '#fafafa'}}>
                            {columns.map((col, idx) => (
                                <td key={col} style={{
                                    padding: '8px 12px', color: 'var(--grey-700)', maxWidth: '400px',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    background: highlightCol === idx ? '#f9f5ff' : 'transparent',
                                    fontWeight: highlightCol === idx ? 'bold' : 'normal'
                                }}>
                                    {String(row[col] ?? '-')}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {rows.length === 5 && (
                        <tr>
                            <td colSpan={columns.length} style={{
                                padding: '8px 12px',
                                textAlign: 'center',
                                color: '#999',
                                fontStyle: 'italic',
                                background: '#fafafa'
                            }}>
                                … only showing top 5 rows
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

// Step 1: gzip read
const Step1Table = ({data, highlightedPartition}) => {
    const allRows = (data?.sample_rows?.raw_log ?? []).map(line => ({
        partition: 'Partition 0',
        value: line
    }));

    const isFiltered = highlightedPartition !== null && highlightedPartition !== undefined;
    const rows = isFiltered && highlightedPartition !== 0 ? [] : allRows;
    const partitionCount = data?.spark_internals?.partition_distribution?.length ?? null;
    const idleSlots = partitionCount != null ? Math.max(partitionCount - 1, 0) : null;


    return (
        <>
            {isFiltered && highlightedPartition !== 0 && (
                <CrossFilterBanner partitionId={highlightedPartition}/>
            )}
            <GlassBoxTable
                title="df.show(5): Raw Ingestion"
                badge="lazy"
                explanation={
                    isFiltered && highlightedPartition !== 0
                        ? `Partition ${highlightedPartition} is empty, gzip is non-splittable so every row loads into Partition 0 only.`
                        : `Because gzip is non-splittable, every single row loads into Partition 0. ${idleSlots != null ? `The other ${idleSlots} worker slots are idle.` : 'Worker slot count is shown once notebook partition metadata is available.'}`
                }
                columns={['partition', 'value']}
                rows={rows}
                highlightCol={0}
                emptyMessage={`This partition is empty, gzip is non-splittable. All ${(data?.filter_results?.total ?? 0).toLocaleString()} rows are on Partition 0.`}
            />
        </>
    );
};

// Step 2: repartition

const Step2Table = ({data, highlightedPartition}) => {
    const allDist = data?.spark_internals?.partition_distribution ?? [];
    const isFiltered = highlightedPartition !== null && highlightedPartition !== undefined;
    const dist = isFiltered
        ? allDist.filter(p => p.partition_id === highlightedPartition)
        : allDist;

    const rows = dist.map(p => ({
        partition_id: `Partition ${p.partition_id}`,
        row_count: p.row_count.toLocaleString(),
    }));

    return (
        <>
            {isFiltered && <CrossFilterBanner partitionId={highlightedPartition}/>}
            <GlassBoxTable
                title="Partition Distribution: after repartition()"
                badge="shuffle"
                explanation={
                    isFiltered
                        ? `Partition ${highlightedPartition} received ${rows[0]?.row_count ?? 0} rows. Round-robin distribution means each partition gets an equal share, so there is no skew.`
                        : `Spark shuffled the data across ${allDist.length} partitions. Each partition now holds ~${allDist[0] ? Math.round(allDist[0].row_count / 1000) + 'k' : '?'} rows. Note: normally you would use .cache() here, but Databricks Serverless does not support cache(). The Delta write-and-reload achieves the same effect by breaking the DAG lineage in a Serverless-compatible way.`
                }
                columns={['partition_id', 'row_count']}
                rows={rows}
                highlightCol={1}
                emptyMessage="No data, partition index out of range."
            />
        </>
    );
};

// Step 3: lazy filter

const Step3Table = ({data, highlightedPartition}) => {
    const trackedRows = data?.tracked_rows ?? [];
    const isFiltered = highlightedPartition !== null && highlightedPartition !== undefined;

    // Flatten tracked rows to a per-partition list
    const allRows = trackedRows.flatMap(tp =>
        tp.rows.map(r => ({...r, partition_id: tp.partition_id}))
    );
    const rows = isFiltered
        ? allRows.filter(r => r.partition_id === highlightedPartition)
        : allRows;

    return (
        <>
            {isFiltered && <CrossFilterBanner partitionId={highlightedPartition}/>}
            <GlassBoxTable
                title="filter(): Predicate Added to DAG (Nothing Executed Yet)"
                badge="lazy"
                explanation={
                    isFiltered
                        ? `Partition ${highlightedPartition} holds these rows. The filter predicate exists in the DAG but has not fired, so these rows have not been scanned. Step 4's count() will trigger execution.`
                        : "Spark has recorded the filter predicate but has not scanned a single row. The data below shows what each partition holds, and the ✓/✗ column shows what would happen when count() fires in Step 4."
                }
                columns={['partition_id', 'host', 'would_pass']}
                rows={rows.map(r => ({
                    partition_id: `P${r.partition_id}`,
                    host: r.host,
                    would_pass: r.passes_japan_filter ? '✓ would pass' : '✗ would be dropped'
                }))}
                highlightCol={2}
                emptyMessage="No tracked rows on this partition."
            />
        </>
    );
};

// Step 4: count() action



const Step4Table = ({data, highlightedPartition}) => {
    const total = data?.filter_results?.total ?? 0;
    const isFiltered = highlightedPartition !== null && highlightedPartition !== undefined;

    // Real total match count from filter_partition_distribution
    const filterDist = data?.spark_internals?.filter_partition_distribution ?? [];
    const realMatchCount = filterDist.length > 0
        ? filterDist.reduce((sum, p) => sum + (p.row_count ?? 0), 0)
        : (data?.filter_results?.hosts_japan ?? 0);

    // Detect action type from the pipeline operation string
    const step4Op = data?.spark_internals?.transformation_pipeline?.[3]?.operation ?? 'hosts_japan.count()';
    const actionTitle = `filter().${step4Op.replace('hosts_japan.', '')}: Execution Result`;

    // Derive method and returned count from what was normalised into hosts_japan
    const returnedCount = data?.filter_results?.hosts_japan ?? 0;
    const isCount = step4Op.includes('count()');
    const isFirst = step4Op.includes('first()');
    const isTake = step4Op.includes('take(');

    const pred = data?.spark_config?.filter_predicate ?? '.jp';
    const partCount = data?.spark_internals?.partition_distribution?.length ?? null;

    let rows;
    let explanation;
    let shortCircuitBanner = null;

    if (isFiltered) {
        const partDist = data?.spark_internals?.partition_distribution ?? [];
        const matchRow = filterDist.find(p => p.partition_id === highlightedPartition);
        const totalRow = partDist.find(p => p.partition_id === highlightedPartition);
        const partTotal = totalRow?.row_count ?? 0;
        const partMatch = matchRow?.row_count ?? 0;

        rows = [
            {metric: 'Rows scanned on this partition', count: partTotal.toLocaleString()},
            {metric: `Rows matching "${pred}" on this partition`, count: partMatch.toLocaleString()},
            {metric: 'Rows dropped by filter', count: (partTotal - partMatch).toLocaleString()},
        ];
        explanation = `Partition ${highlightedPartition} processed its share in parallel. No data crossed the network, each partition evaluated the predicate locally.`;
    } else if (isCount) {
        rows = [
            {metric: 'Total rows scanned', count: total.toLocaleString()},
            {metric: `Rows matching "${pred}"`, count: realMatchCount.toLocaleString()},
            {metric: 'Rows dropped by filter', count: (total - realMatchCount).toLocaleString()},
        ];
        explanation = `count() is an aggregate action. Spark must scan every row${partCount != null ? ` on all ${partCount} partitions` : ''}, compute a local count on each, then sum the results on the driver. All partitions execute fully.`;
    } else if (isFirst) {
        rows = [
            {metric: 'Rows returned to driver', count: '1'},
            {metric: `Total rows matching "${pred}" (actual)`, count: realMatchCount.toLocaleString()},
            {metric: 'Total rows scanned', count: total.toLocaleString()},
        ];
        explanation = `first() is a retrieval action. Spark executes partitions and short-circuits the moment it finds the first matching row. ${partCount != null ? `It may never scan partitions 1-${Math.max(partCount - 1, 0)} at all.` : 'It may never scan all partitions.'} Only one Row object travels to the driver, not a count.`;
        shortCircuitBanner = `first() found a match early and stopped. ${realMatchCount.toLocaleString()} rows actually match "${pred}" across all partitions, but Spark did not need to count them all.`;
    } else if (isTake) {
        rows = [
            {metric: 'Rows returned to driver', count: returnedCount.toLocaleString()},
            {metric: `Total rows matching "${pred}" (actual)`, count: realMatchCount.toLocaleString()},
            {metric: 'Total rows scanned', count: total.toLocaleString()},
        ];
        explanation = `take(${returnedCount}) is a retrieval action. Like first(), Spark short-circuits once it has collected enough rows. It scans partitions in order and stops early, so ${partCount != null ? `not all ${partCount} partitions may execute` : 'not all partitions may execute'}.`;
        shortCircuitBanner = `take(${returnedCount}) collected ${returnedCount} row(s) and stopped. ${realMatchCount.toLocaleString()} rows actually match "${pred}", but Spark did not need to count them all.`;
    } else {
        // safe fallback
        rows = [
            {metric: 'Total rows scanned', count: total.toLocaleString()},
            {metric: `Rows matching "${pred}"`, count: realMatchCount.toLocaleString()},
            {metric: 'Rows dropped by filter', count: (total - realMatchCount).toLocaleString()},
        ];
        explanation = `The DAG has executed. Spark pushed the filter down to ${partCount != null ? partCount : 'available'} worker nodes.`;
    }

    return (
        <>
            {isFiltered && <CrossFilterBanner partitionId={highlightedPartition}/>}
            {shortCircuitBanner && !isFiltered && (
                <div style={{
                    background: '#fef3c7', padding: '8px 12px', borderRadius: '4px',
                    fontSize: '12px', color: '#92400e', border: '1px solid #fcd34d',
                    marginBottom: '4px', lineHeight: '1.5'
                }}>
                    {shortCircuitBanner}
                </div>
            )}
            <GlassBoxTable
                title={actionTitle}
                badge="action"
                explanation={explanation}
                columns={['metric', 'count']}
                rows={rows}
                highlightCol={1}
            />
        </>
    );
};

// Step 5: withColumn parse

const Step5Table = ({data, highlightedPartition}) => {
    const raw = data?.sample_rows?.raw_log ?? [];
    const parsed = data?.sample_rows?.parsed_df ?? [];
    const isFiltered = highlightedPartition !== null && highlightedPartition !== undefined;

    let rows;
    let explanation;

    if (isFiltered) {
        // Filter tracked_rows_parsed to those on the highlighted partition
        const trackedEntry = (data?.tracked_rows ?? []).find(t => t.partition_id === highlightedPartition);
        const trackedRows = trackedEntry?.rows ?? [];
        rows = trackedRows.map(r => ({
            host: r.host, status: r.status || '-', day: r.day ? `${r.day} Aug` : '-'
        }));
        explanation = `Partition ${highlightedPartition} applied regexp_extract locally. ${rows.length > 0 ? `${rows.length} tracked row(s) found here` : 'No tracked rows on this partition (they landed elsewhere after repartition).'}`;
    } else {
        // Default: show before -> after parsing for sample rows
        rows = parsed.map((p, i) => ({
            raw_value: raw[i] ? `${raw[i].substring(0, 28)}...` : '-',
            host: p.host, status: p.status, day: p.day
        }));
        explanation = 'Narrow transformation: each partition applies regexp_extract locally. No shuffle, data never crosses the network boundary.';
    }

    return (
        <>
            {isFiltered && <CrossFilterBanner partitionId={highlightedPartition}/>}
            <GlassBoxTable
                title="withColumn(): Projection & Parsing"
                badge="lazy"
                explanation={explanation}
                columns={isFiltered ? ['host', 'status', 'day'] : ['raw_value', 'host', 'status', 'day']}
                rows={rows}
                highlightCol={isFiltered ? 1 : 1}
                emptyMessage={isFiltered ? `No tracked rows were assigned to Partition ${highlightedPartition} during repartition. Click a different partition.` : null}
            />
        </>
    );
};

// Step 6: single editable groupBy
const Step6Table = ({data, highlightedPartition}) => {
    const groupbyKey = data?.spark_config?.groupby_key ?? 'status';

    // distinct key count from partition_story
    const realPartCount = data?.spark_internals?.partition_story?.post_shuffle_partitions ?? null;

    // status_distribution holds whatever the student grouped by
    const groupRows = (data?.status_distribution ?? []).map(r => ({
        [groupbyKey]: r.key ?? '-',
        total_requests: r.count.toLocaleString()
    }));

    // Shown count vs real count
    const displayCount = groupRows.length;
    const isCapped = realPartCount !== null && displayCount < realPartCount;
    const partLabel = realPartCount?.toLocaleString() ?? displayCount.toLocaleString();

    const isFiltered = highlightedPartition !== null && highlightedPartition !== undefined;

    return (
        <>
            {isFiltered && (
                <div style={{
                    background: '#f0f9ff', padding: '8px 12px', borderRadius: '4px',
                    fontSize: '12px', color: '#0369a1', border: '1px solid #bae6fd', marginBottom: '4px'
                }}>
                    repartitionByRange() placed each distinct <code>{groupbyKey}</code> value on its own partition
                    before groupBy, each partition owns exactly one key.
                </div>
            )}
            {isCapped && (
                <div style={{
                    background: '#fff7ed', padding: '6px 12px', borderRadius: '4px',
                    fontSize: '11px', color: '#c2410c', border: '1px solid #fed7aa', marginBottom: '4px'
                }}>
                    Showing top {displayCount.toLocaleString()} of {partLabel} distinct <code>{groupbyKey}</code> values
                    by request count.
                    High cardinality key, use <code>groupby_col = "status"</code> or <code>"day"</code> for a compact
                    view.
                </div>
            )}
            <GlassBoxTable
                title={`groupBy('${groupbyKey}').count(): Aggregation Result`}
                badge="shuffle"
                explanation={`repartitionByRange() routed all rows with the same '${groupbyKey}' value to the same partition before groupBy, so ${partLabel} distinct keys map to ${partLabel} partitions${isCapped ? ` (table capped at top ${displayCount})` : ''}. The groupBy then runs locally with no cross-partition data movement. Try changing groupby_col to 'day' or 'host' to see how key cardinality changes the partition layout.`}
                columns={[groupbyKey, 'total_requests']}
                rows={groupRows}
                highlightCol={1}
                emptyMessage="No aggregation results, run the notebook first."
            />
        </>
    );
};

// Router
const DATA_TABLE_MAP = {
    1: Step1Table,
    2: Step2Table,
    3: Step3Table,
    4: Step4Table,
    5: Step5Table,
    6: Step6Table,
};

const DataTable = ({currentStep, data, highlightedPartition}) => {
    const StepTable = DATA_TABLE_MAP[currentStep];
    if (!StepTable) return null;
    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
            <StepTable data={data} highlightedPartition={highlightedPartition}/>
        </div>
    );
};

export default DataTable;