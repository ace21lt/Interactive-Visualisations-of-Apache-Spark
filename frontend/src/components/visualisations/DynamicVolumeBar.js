import React, {useRef, useEffect} from 'react';
import * as d3 from 'd3';

const DynamicVolumeBar = ({pipelineData, currentStep}) => {
    const svgRef = useRef();
    const prevRowsRef = useRef(); // Tracks the previous value

    useEffect(() => {
        if (!pipelineData || !pipelineData.length) return;

        const activeStep = pipelineData[currentStep - 1];

        // Resolve LAZY steps
        let targetRows = activeStep.output_rows;
        if (targetRows == null && currentStep > 1) {
            targetRows = pipelineData[currentStep - 2].output_rows;
        }
        if (targetRows == null) targetRows = 0;

        // Setup dimensions
        const width = 600;
        const margin = {top: 30, right: 120, bottom: 20, left: 20};
        const innerWidth = width - margin.left - margin.right;

        const svg = d3.select(svgRef.current);

        // 1. Initialize SVG Layers
        if (svg.selectAll("g").empty()) {
            const g = svg.append("g");

            // Background track
            g.append("rect")
                .attr("class", "track-bar")
                .attr("x", margin.left).attr("y", 30)
                .attr("width", innerWidth).attr("height", 40)
                .attr("fill", "var(--grey-200)").attr("rx", 4);

            // The dynamic colored bar
            g.append("rect")
                .attr("class", "dynamic-bar")
                .attr("x", margin.left).attr("y", 30)
                .attr("width", innerWidth).attr("height", 40)
                .attr("fill", "var(--uos-purple)").attr("rx", 4);

            // The animated text counter
            g.append("text")
                .attr("class", "dynamic-label")
                .attr("x", margin.left + innerWidth + 15).attr("y", 55)
                .attr("font-family", "var(--font-mono)").attr("font-size", "16px")
                .attr("font-weight", "bold").attr("fill", "var(--grey-900)");
        }

        // 2. Define the Linear Scale
        const maxRows = Math.max(...pipelineData.map(d => d.output_rows ?? 0), targetRows, 1);
        const xScale = d3.scaleLinear()
            .domain([0, maxRows])
            .range([5, innerWidth]);

        // 3. Setup the D3 Transition
        const t = d3.transition()
            .duration(850)
            .ease(d3.easeCubicOut);

        // Determine color: Yellow for LAZY (no execution), Purple for ACTION
        const isLazy = activeStep.lazy && currentStep !== 1;
        const barColor = isLazy ? "#ffbb33" : "var(--uos-purple)";

        // 4. Animate the Bar Width and Color
        svg.select(".dynamic-bar")
            .transition(t)
            .attr("width", xScale(targetRows))
            .attr("fill", barColor);

        // 5. Animate the Number Interpolation and slide the text
        const prevRows = prevRowsRef.current ?? targetRows;
        svg.select(".dynamic-label")
            .transition(t)
            .attr("x", margin.left + xScale(targetRows) + 15)
            .tween("text", function () {
                const i = d3.interpolateRound(prevRows, targetRows);
                return function (time) {
                    d3.select(this).text(d3.format(",")(i(time)));
                };
            });

        // Save current target for the next animation cycle
        prevRowsRef.current = targetRows;

    }, [pipelineData, currentStep]);

    return (
        <div style={{width: '100%', overflowX: 'auto'}}>
            <svg ref={svgRef} width="600" height="100" viewBox="0 0 600 100" style={{maxWidth: '100%'}}></svg>
        </div>
    );
};

export default DynamicVolumeBar;