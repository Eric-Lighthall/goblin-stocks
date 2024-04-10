document.addEventListener('DOMContentLoaded', (event) => {
    getTokenPrice();
});

async function getTokenPrice() {
    try {
        const response = await fetch("/token-prices");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(data);
        drawGraph(data)
    }
    catch (error) {
        console.error("Could not fetch token prices: ", error);
    }
}

async function updateGraph(timeRange) {
    try {
        const response = await fetch(`/token-prices?timeRange=${timeRange}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        drawGraph(data);
    } 
    catch (error) {
        console.error("Could not update graph: ", error);
    }
}

function drawGraph(data) {
    // Clear the existing graph
    d3.select("#chart").selectAll("*").remove();

    // Set up the dimensions and margins of the graph
    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const width = 960 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    // Append an SVG element to the body
    const svg = d3
        .select("#chart")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Extract the timestamps and prices from the data
    const timestamps = data.map((entry) => new Date(entry.timestamp));
    const prices = data.map((entry) => entry.price);

    // Find the min and max price values in your data
    const minPrice = d3.min(prices);
    const maxPrice = d3.max(prices);

    // Add some padding to the min and max
    const padding = (maxPrice - minPrice) * 0.05;

    // Set up the scales
    const x = d3
        .scaleTime()
        .domain(d3.extent(data, (d) => new Date(d.timestamp)))
        .range([0, width]);

    const y = d3
        .scaleLinear()
        .domain([minPrice - padding, maxPrice + padding])
        .range([height, 0]);

    // Create the line generator
    const line = d3
        .line()
        .x((d) => x(new Date(d.timestamp)))
        .y((d) => y(d.price));

    // Add the x-axis
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    // Add the y-axis
    svg.append("g").attr("class", "axis").call(d3.axisLeft(y));

    // Add the line path
    svg.append("path").datum(data).attr("class", "line").attr("d", line);

    // Create the tooltip
    const tooltip = d3.select("body").append("div").attr("class", "tooltip");

    // Add the overlay for capturing mouse events
    svg.append("rect")
        .attr("class", "overlay")
        .attr("width", width)
        .attr("height", height)
        .on("mouseover", () => {
            tooltip.style("opacity", 1);
        })
        .on("mouseout", () => {
            tooltip.style("opacity", 0);
        })
        .on("mousemove", function (event) {
            mousemove(event, x, y, data, tooltip, svg);
        });
}

// Tooltip mousemove event handler
function mousemove(event, x, y, data, tooltip, svg) {
    const mouseX = d3.pointer(event)[0];
    const x0 = x.invert(mouseX);

    data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const dates = data.map((entry) => new Date(entry.timestamp));

    const i = d3.bisector((d) => d).left(dates, x0, 1);

    const d0 = data[i - 1];
    const d1 = data[i];

    if (!d0 || !d1) return; // Added null checks here

    // Calculate the midpoint date between d0 and d1
    const midPointDate = new Date(
        (dates[i - 1].getTime() + dates[i].getTime()) / 2
    );

    // Select data based on whether the mouse is past the midpoint
    const d = x0 >= midPointDate ? d1 : d0;

    const svgRect = svg.node().getBoundingClientRect();
    const tooltipWidth = tooltip.node().getBoundingClientRect().width;
    const tooltipX = x(new Date(d.timestamp)) + svgRect.left - tooltipWidth / 4;
    const tooltipY = y(d.price) + svgRect.top - 10;

    tooltip.html(`
        <div class="tooltip-content">
            <div class="price-container">
                <span>Price: ${d.price}</span>
                <img src="images/coin-gold.png" alt="WoW Gold" class="gold-icon">
            </div>
            <span>Date: ${moment(d.timestamp).format('YYYY-MM-DD hh:mm A')}</span>
        </div>
    `)
    .style("left", `${tooltipX}px`)
    .style("top", `${tooltipY - 70}px`);

    // Create or update the vertical line
    let verticalLine = svg.select(".vertical-line");
    if (verticalLine.empty()) {
        verticalLine = svg.append("line")
            .attr("class", "vertical-line")
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "4,4");
    }

    verticalLine
    .attr("x1", x(new Date(d.timestamp)))
    .attr("y1", y(d.price))
    .attr("x2", x(new Date(d.timestamp)))
    .attr("y2", y.range()[0]);
}
