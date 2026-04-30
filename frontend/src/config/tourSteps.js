// Tour step definitions for Lab 1 and Lab 2
import { brandPurple, brandPurpleDark } from '../theme/palette';

export const lab1Steps = [
    {
        target: '.header',
        title: 'Lab steps',
        content: 'Move through the six Lab 1 transformations here. Each step changes the code, the trace, and the explanation together.',
        placement: 'bottom',
        skipBeacon: true,
        buttons: ['skip', 'close', 'primary'],
    },
    {
        target: '.code-panel',
        title: 'Code editor',
        content: 'Edit the PySpark cell for the current step. Only the editable steps will send your changes to Databricks.',
        placement: 'right',
        skipBeacon: true,
    },
    {
        target: '.data-panel',
        title: 'Execution view',
        content: 'This panel collects the trace, tables, charts, and step summary for the current run.',
        placement: 'left',
        skipBeacon: true,
    },
    {
        target: '.step-header',
        title: 'Operation summary',
        content: 'The current Spark operation sits here, with badges that show whether it is lazy or an action.',
        placement: 'bottom',
        skipBeacon: true,
    },
    {
        target: '.partition-diagram',
        title: 'Partition map',
        content: 'See how rows are spread across partitions. Click a partition to inspect its rows and distribution.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.partition-diagram-legend',
        title: 'Colour key',
        content: 'This legend explains the colours used in the partition map.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.stats-row',
        title: 'Run stats',
        content: 'Quick counts for partitions, row distribution, and shuffle state on this step.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.viz-card',
        title: 'Row volume',
        content: 'The bar shows how much data this step processes. Compare it as you move through the lab.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.bottom-panel',
        title: 'Key Concept',
        content: 'A short explanation of the current Spark idea, written to match the step you are on.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.trace-btn',
        title: 'Save trace',
        content: 'Download the current run as JSON. You can load it later without rerunning Spark.',
        placement: 'left',
        skipBeacon: true,
    },
];

export const lab2Steps = [
    {
        target: '.header',
        title: 'Lab steps',
        content: 'Move through the seven Lab 2 steps. The sequence covers DataFrame work, ML training, and pipeline concepts.',
        placement: 'bottom',
        skipBeacon: true,
        buttons: ['skip', 'close', 'primary'],
    },
    {
        target: '.code-panel',
        title: 'Notebook code',
        content: 'Edit the PySpark or scikit-learn code for the current step. Try changing the parameters, then run it again.',
        placement: 'right',
        skipBeacon: true,
    },
    {
        target: '.data-panel',
        title: 'Execution view',
        content: 'This panel combines the cluster view, tables, charts, and metrics for the current run.',
        placement: 'left',
        skipBeacon: true,
    },
    {
        target: '.step-header',
        title: 'Operation summary',
        content: 'The badges show whether this step runs on Spark, on the driver, or as reference material.',
        placement: 'bottom',
        skipBeacon: true,
    },
    {
        target: '.lab2-cluster-view',
        title: 'Cluster view',
        content: 'See how data moves between executors. Click partitions or segments to inspect the rows behind them.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.lab2-cluster-view-legend',
        title: 'Colour key',
        content: 'Blue marks Spark or train data, orange marks test data, and green marks scikit-learn work.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.bottom-panel',
        title: 'Key Concept',
        content: 'A short explanation of the current ML or DataFrame concept, with the key effect of this step.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.trace-btn',
        title: 'Save trace',
        content: 'Download this run as JSON so you can review it later without rerunning Spark.',
        placement: 'left',
        skipBeacon: true,
    },
];

// Joyride configuration
export const joyrideConfig = {
    continuous: true,
    showProgress: true,
    showSkipButton: true,
    scrollOffset: 80,
    locale: {
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
    },
    options: {
        skipBeacon: true,
        disableOverlayClose: true,
        spotlightClicks: false,
    },
    styles: {
        options: {
            primaryColor: brandPurple,
            zIndex: 10000,
        },
        tooltip: {
            borderRadius: 8,
            fontSize: 14,
        },
        buttonNext: {
            backgroundColor: brandPurple,
        },
        buttonBack: {
            color: brandPurpleDark,
        },
    },
};