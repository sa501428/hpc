document.addEventListener('DOMContentLoaded', function() {
    // Remove form submit listener and add input listeners to all form fields
    const inputs = document.querySelectorAll('#calculatorForm input');
    inputs.forEach(input => {
        input.addEventListener('input', calculateResults);
    });

    // Initial calculation
    calculateResults();
});

function calculateResults() {
    // Get input values
    const collectionGoal = parseFloat(document.getElementById('collectionGoal').value);
    const cd34Percent = parseFloat(document.getElementById('cd34Percent').value);
    const wbc = parseFloat(document.getElementById('wbc').value);
    const recipientWeight = parseFloat(document.getElementById('recipientWeight').value);
    const efficiency = parseFloat(document.getElementById('efficiency').value);
    const flowRate = parseFloat(document.getElementById('flowRate').value);

    // Calculate CD34+ cells per microliter - Fix calculation
    const cd34CellsPerUl = (cd34Percent / 100) * wbc * 1000;  // Add back the * 1000 factor

    // Calculate volumes
    const highEfficiencyVolume = calculateVolume(collectionGoal, cd34CellsPerUl, efficiency + 0.1, recipientWeight);
    const expectedEfficiencyVolume = calculateVolume(collectionGoal, cd34CellsPerUl, efficiency, recipientWeight);
    const lowEfficiencyVolume = calculateVolume(collectionGoal, cd34CellsPerUl, efficiency - 0.1, recipientWeight);

    // Update results
    updateResults(cd34CellsPerUl, highEfficiencyVolume, expectedEfficiencyVolume, lowEfficiencyVolume);
    
    // Update chart
    createChart(cd34CellsPerUl, recipientWeight, flowRate, efficiency, collectionGoal);
}

function calculateVolume(goal, cd34PerUl, eff, weight) {
    return (goal * (1/cd34PerUl) * (1/eff) * weight); // Remove the * 1000 since it's now in cd34CellsPerUl
}

function updateResults(cd34Count, highVol, expectedVol, lowVol) {
    // Get flow rate for time calculations
    const flowRate = parseFloat(document.getElementById('flowRate').value);
    
    // Calculate times
    const calculateTime = (volumeInL) => {
        const volumeInML = volumeInL * 1000;
        const flowRateMLHr = flowRate * 60;
        return Math.round((volumeInML / flowRateMLHr) * 10) / 10; // Round to nearest 0.1
    };

    const highTime = calculateTime(highVol);
    const expectedTime = calculateTime(expectedVol);
    const lowTime = calculateTime(lowVol);

    document.getElementById('cd34Count').innerHTML = 
        `Patient CD34+ Cell Count: ${cd34Count.toFixed(0)} cells/uL`;

    document.getElementById('volumes').innerHTML = `
        <div>At Higher (+10%) Efficiency: ${highVol.toFixed(1)} L (${highTime.toFixed(1)} hrs)</div>
        <div>At Expected Efficiency: ${expectedVol.toFixed(1)} L (${expectedTime.toFixed(1)} hrs)</div>
        <div>At Lower (-10%) Efficiency: ${lowVol.toFixed(1)} L (${lowTime.toFixed(1)} hrs)</div>
    `;
}

function createChart(cd34PerUl, weight, flowRate, efficiency, goal) {
    // Get Y-Axis breaks value, default to 5 if not valid
    const yAxisBreaksInput = document.getElementById('yAxisBreaks');
    let yAxisBreaks = parseInt(yAxisBreaksInput.value) || 5;
    
    // Enforce minimum of 1
    if (yAxisBreaks < 1) {
        yAxisBreaks = 1;
        yAxisBreaksInput.value = 1;
    } else if (yAxisBreaks > 10) {
        yAxisBreaks = 10;
        yAxisBreaksInput.value = 10;
    }

    // Calculate the maximum time needed (time for lower efficiency)
    const calculateTime = (volumeInL) => {
        const volumeInML = volumeInL * 1000;
        const flowRateMLHr = flowRate * 60;
        return Math.round((volumeInML / flowRateMLHr) * 10) / 10;
    };

    const lowEfficiencyVolume = calculateVolume(goal, cd34PerUl, efficiency - 0.1, weight);
    const maxTime = calculateTime(lowEfficiencyVolume);
    
    // Round up maxTime to next whole number for better graph display
    const xAxisMax = Math.ceil(maxTime);

    // Clear previous chart
    d3.select("#chart").html("");

    // Set up dimensions with more space for labels
    const margin = {top: 20, right: 30, bottom: 50, left: 60};
    const width = document.getElementById('chart').clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Generate data points from 0 to maxTime in 0.5 hour increments
    const timePoints = d3.range(0, xAxisMax + 0.5, 0.5);
    
    const generateLineData = (eff) => {
        return timePoints.map(time => ({
            time,
            cells: calculateCellsPerKg(time, eff, flowRate, cd34PerUl, weight)
        }));
    };

    // Create scales
    const xScale = d3.scaleLinear()
        .domain([0, xAxisMax])
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, goal * 2])
        .range([height, 0]);

    // Modify Y-axis ticks based on yAxisBreaks
    const yAxis = d3.axisLeft(yScale);
    if (yAxisBreaks === 1) {
        // If only 1 break, just show the goal value
        yAxis.tickValues([goal]);
    } else {
        yAxis.ticks(yAxisBreaks);
    }

    // Add axes with labels
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .append("text")
        .attr("x", width / 2)
        .attr("y", 40)
        .attr("fill", "black")
        .style("text-anchor", "middle")
        .text("Time (hours)");

    svg.append("g")
        .call(yAxis)
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -45)
        .attr("x", -height / 2)
        .attr("fill", "black")
        .style("text-anchor", "middle")
        .text("CD34+ Cells (x10^6)/kg");

    // Update grid to match Y-axis ticks
    svg.append("g")
        .attr("class", "grid")
        .selectAll("line")
        .data(yAxisBreaks === 1 ? [goal] : yScale.ticks(yAxisBreaks))
        .enter()
        .append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", d => yScale(d))
        .attr("y2", d => yScale(d));

    // Create line generator
    const line = d3.line()
        .x(d => xScale(d.time))
        .y(d => yScale(d.cells));

    // Add lines for each efficiency
    const efficiencies = [
        {eff: efficiency + 0.1, class: 'he'},
        {eff: efficiency, class: 'ee'},
        {eff: efficiency - 0.1, class: 'le'}
    ];

    efficiencies.forEach(({eff, class: className}) => {
        svg.append("path")
            .datum(generateLineData(eff))
            .attr("class", `line ${className}`)
            .attr("d", line);
    });

    // Add goal line
    svg.append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", yScale(goal))
        .attr("y2", yScale(goal))
        .style("stroke", "black")
        .style("stroke-dasharray", "4");

    // Add legend
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(10, 10)`);

    const legendData = [
        {label: "Higher Efficiency", class: "he"},
        {label: "Expected Efficiency", class: "ee"},
        {label: "Lower Efficiency", class: "le"}
    ];

    legendData.forEach((d, i) => {
        const g = legend.append("g")
            .attr("transform", `translate(0, ${i * 20})`);
        
        g.append("line")
            .attr("x1", 0)
            .attr("x2", 20)
            .attr("y1", 10)
            .attr("y2", 10)
            .attr("class", `line ${d.class}`);
            
        g.append("text")
            .attr("x", 25)
            .attr("y", 10)
            .attr("dy", "0.35em")
            .text(d.label)
            .style("font-size", "12px");
    });
}

function calculateCellsPerKg(time, efficiency, flowRate, cd34PerUl, weight) {
    // Convert flow_rate to uL/min and time to min to yield volume in uL
    const volumeProcessed = (flowRate * 1000) * time * 60;  // Convert mL/min to uL/min, time to minutes
    
    // Calculate total CD34+ cells collected
    const cd34Collected = cd34PerUl * volumeProcessed * efficiency;
    
    // Convert to x10^6 cells/kg
    return (cd34Collected / weight) / 1000000;
} 