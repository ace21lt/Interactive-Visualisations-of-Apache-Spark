import React from 'react';

const PartitionDetailPanel = ({
                                  selectedPartition,
                                  currentStep,
                                  data,
                                  internals,
                                  pipeline,
                                  onClose,
                              }) => {
    if (selectedPartition == null) return null;

    const allTracked = data?.tracked_rows ?? [];
    const trackedEntry = allTracked.find(t => t.partition_id === selectedPartition);
    const trackedRows = trackedEntry?.rows ?? [];

    const partDist = (() => {
        if (currentStep === 4) return internals?.filter_partition_distribution ?? internals?.partition_distribution ?? [];
        if (currentStep === 6 && pipeline?.slice(0, currentStep - 1).some(s => s.shuffle))
            return internals?.daily_partition_distribution ?? internals?.post_shuffle_distribution ?? [];
        if (currentStep === 6) return internals?.post_shuffle_distribution ?? [];
        return internals?.partition_distribution ?? [];
    })();
    const partInfo = partDist.find(p => p.partition_id === selectedPartition);

    const stepLabel = (() => {
        if (currentStep === 1) return 'Raw gzip data (single partition holds everything)';
        if (currentStep === 2) return 'After repartition - rows distributed round-robin';
        if (currentStep === 3) return 'Filter predicate in DAG - same data as Step 2, not yet executed';
        if (currentStep === 4) return 'After filter executed - only matching rows remain';
        if (currentStep === 5) return 'After withColumn - rows now have host, status, day columns';
        if (currentStep === 6) return `After repartitionByRange - partition owns rows with the same ${data?.spark_config?.groupby_key ?? 'key'} value`;
        return '';
    })();

    const partRows = (() => {
        if (currentStep === 6) {
            const grouped = data?.grouped_tracked_rows ?? [];
            return grouped.find(t => t.partition_id === selectedPartition)?.rows ?? [];
        }
        return currentStep <= 5 ? trackedRows : [];
    })();

    return (
        <div className="partition-diagram-panel">
            <div className="partition-diagram-panel-header">
                <span className="partition-diagram-panel-title">
                    Partition {selectedPartition}
                    {partInfo ? ` - ${partInfo.row_count.toLocaleString()} rows` : ''}
                    {partRows.length > 0 ? ` - ${partRows.length} samples` : ''}
                </span>
                <span className="partition-diagram-panel-subtitle">{stepLabel}</span>
                <button
                    onClick={onClose}
                    className="partition-diagram-panel-close"
                    aria-label="Close partition detail"
                >
                    X
                </button>
            </div>

            {partRows.length > 0 ? (
                <div className="partition-diagram-panel-body">
                    <div className="partition-diagram-panel-section-title">
                        {currentStep === 3
                            ? 'Rows in this partition (filter NOT yet executed - Step 4 will trigger it):'
                            : currentStep === 4
                                ? 'Rows in this partition BEFORE filter (Step 4 has now executed on these):'
                                : currentStep === 5
                                    ? 'Rows in this partition (now have parsed host/status/day columns):'
                                    : currentStep === 6
                                        ? `Sample rows - all share the same ${data?.spark_config?.groupby_key ?? 'key'} value:`
                                        : 'Raw log entries in this partition:'}
                    </div>
                    <div className="partition-diagram-panel-console">
                        {partRows.map((row, i) => (
                            <div
                                key={i}
                                className="partition-diagram-panel-console-line"
                            >
                                {currentStep === 6
                                    ? `${row.host}  |  status: ${row.status}  |  day: ${row.day}`
                                    : row.raw_value}
                            </div>
                        ))}
                    </div>

                    {currentStep === 6 ? (
                        <div className="partition-diagram-panel-copy">
                            <div className="partition-diagram-panel-section-title">Aggregated result for this
                                partition:
                            </div>
                            <div className="partition-diagram-panel-agg-box">
                                {partRows[0] && (
                                    <span>
                                        <strong>{data?.spark_config?.groupby_key ?? 'key'}:</strong> {partRows[0][data?.spark_config?.groupby_key ?? 'status']} &nbsp;|&nbsp;
                                        <strong>total rows:</strong> {partInfo?.row_count?.toLocaleString() ?? '?'}
                                    </span>
                                )}
                            </div>
                            <div className="partition-diagram-panel-note">
                                Showing {partRows.length} sample rows from this partition. All rows in this partition
                                share the same <code>{data?.spark_config?.groupby_key ?? 'key'}</code> value -
                                repartitionByRange guaranteed this before groupBy ran.
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="partition-diagram-panel-section-title">
                                {currentStep === 3
                                    ? 'Predicted filter outcome (DAG recorded, not yet executed):'
                                    : currentStep === 4
                                        ? 'Filter result - which rows survived:'
                                        : 'Filter result (from Step 3/4) - same rows, now also have parsed columns in DataTable ->:'}
                            </div>
                            <div className="partition-diagram-table-wrap">
                                <table className="partition-diagram-table">
                                    <thead>
                                    <tr className="partition-diagram-table-head-row">
                                        {['host', currentStep === 3 ? 'would pass filter?' : 'passes filter'].map(f => (
                                            <th key={f} className="partition-diagram-table-head-cell">{f}</th>
                                        ))}
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {partRows.map((row, i) => (
                                        <tr key={i} className="partition-diagram-table-row">
                                            <td className="partition-diagram-table-host">{row.host ?? '-'} </td>
                                            <td className="partition-diagram-table-cell">
                                                <span
                                                    className={row.passes_japan_filter ? 'partition-diagram-status partition-diagram-status--pass' : 'partition-diagram-status partition-diagram-status--fail'}
                                                >
                                                    {currentStep === 3
                                                        ? (row.passes_japan_filter ? 'yes, would pass (DAG only)' : 'no, would be dropped (DAG only)')
                                                        : (row.passes_japan_filter ? 'passed filter' : 'filtered out')}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="partition-diagram-panel-note">
                                Showing {partRows.length} of {partInfo?.row_count?.toLocaleString() ?? '?'} rows in this
                                partition.
                                {data?.spark_config?.filter_predicate === '.jp' && (
                                    <span className="partition-diagram-predicate-note">
                                        <strong>Why does .contains("{data?.spark_config?.filter_predicate ?? '.jp'}") match some unexpected rows?</strong>{' '}
                                        Spark&apos;s <code>.contains()</code> searches the <em>entire raw log line</em> as a flat string, not just the host field. This means a request for a <code>.jpeg</code> image (for example <code>livevideo.jpeg</code>) also matches <code>.jp</code> because "jpeg" contains "jp" as a substring. This is the same behavior as the Lab 1 code - <code>logFile.filter(logFile.value.contains(".jp"))</code> - and is why Step 5&apos;s <code>regexp_extract</code> is needed to isolate just the host field for more precise filtering.
                                    </span>
                                )}
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="partition-diagram-panel-empty">No sample data available for this partition. Run the
                    notebook first.</div>
            )}
        </div>
    );
};

export default PartitionDetailPanel;


