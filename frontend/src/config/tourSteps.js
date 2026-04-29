// Tour step definitions for Lab 1 and Lab 2

export const lab1Steps = [
    {
        target: '.header',
        title: 'Step Navigation',
        content: 'Use these buttons to navigate through the 6 transformation steps. Each step shows a different Spark operation.',
        placement: 'bottom',
        skipBeacon: true,
        buttons: ['skip', 'close', 'primary'],
    },
    {
        target: '.code-panel',
        title: 'Code Editor',
        content: 'View and edit PySpark code here. Some steps allow you to modify the code and run it on your Databricks cluster.',
        placement: 'right',
        skipBeacon: true,
    },
    {
        target: '.data-panel',
        title: 'Visualisation Panel',
        content: 'This scrollable panel shows execution results, data tables, and interactive visualisations for the current step.',
        placement: 'left',
        skipBeacon: true,
    },
    {
        target: '.step-header',
        title: 'Operation Info',
        content: 'Shows the current operation name and badges indicating whether it is LAZY (builds the DAG) or an ACTION (triggers execution).',
        placement: 'bottom',
        skipBeacon: true,
    },
    {
        target: '.partition-diagram',
        title: 'Cluster Diagram',
        content: 'Interactive visualisation of how data is distributed across partitions. Click on any partition to see its details.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.partition-diagram-legend',
        title: 'Diagram Legend',
        content: 'Explains the colour coding used in the cluster diagram above.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.stats-row',
        title: 'Statistics',
        content: 'Quick stats showing partition counts, row distributions, and shuffle information for the current step.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.viz-card',
        title: 'Data Volume Bar',
        content: 'Animated bar showing how many rows are processed at this step. Watch it change as you navigate between steps.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.bottom-panel',
        title: 'Key Concept',
        content: 'Educational explanation of the current step\'s Spark concept. Read this to understand what\'s happening.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.trace-btn',
        title: 'Save Trace',
        content: 'Download the execution trace as a JSON file. You can reload it later using "Load Trace" without re-running Spark.',
        placement: 'left',
        skipBeacon: true,
    },
];

export const lab2Steps = [
    {
        target: '.header',
        title: 'Step Navigation',
        content: 'Navigate through 7 steps covering DataFrame operations, ML training, and pipeline concepts.',
        placement: 'bottom',
        skipBeacon: true,
        buttons: ['skip', 'close', 'primary'],
    },
    {
        target: '.code-panel',
        title: 'Notebook Code',
        content: 'View the PySpark/scikit-learn code for each step. Edit parameters like regularisation strength and click Run to see effects.',
        placement: 'right',
        skipBeacon: true,
    },
    {
        target: '.data-panel',
        title: 'Visualisation Panel',
        content: 'Shows step-specific visualisations: cluster diagrams, data tables, charts, and ML metrics.',
        placement: 'left',
        skipBeacon: true,
    },
    {
        target: '.step-header',
        title: 'Operation Info',
        content: 'Shows operation type badges: SPARK DISTRIBUTED (cluster-wide), DRIVER (local scikit-learn), or RDD CONCEPTS (reference material).',
        placement: 'bottom',
        skipBeacon: true,
    },
    {
        target: '.lab2-cluster-view',
        title: 'Cluster Execution View',
        content: 'Interactive diagram showing how data flows between Spark executors. Click partitions or data segments to inspect rows.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.lab2-cluster-view-legend',
        title: 'Colour Legend',
        content: 'Explains colours: blue for Spark/train data, orange for test data, green for scikit-learn operations.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.bottom-panel',
        title: 'Key Concept',
        content: 'Detailed explanation of the current ML or DataFrame concept. Includes formulas and parameter effects.',
        placement: 'top',
        skipBeacon: true,
    },
    {
        target: '.trace-btn',
        title: 'Save Trace',
        content: 'Download this run\'s data as JSON. Reload later to review results without running Spark again.',
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
            primaryColor: '#5B2C7B',
            zIndex: 10000,
        },
        tooltip: {
            borderRadius: 8,
            fontSize: 14,
        },
        buttonNext: {
            backgroundColor: '#5B2C7B',
        },
        buttonBack: {
            color: '#5B2C7B',
        },
    },
};