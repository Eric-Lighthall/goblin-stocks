let tokenPriceData = [];
async function getTokenPrice() {
    try {
        const response = await fetch("/graph-data");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        tokenPriceData = await response.json();
        displayUpdateTimeDetails(tokenPriceData);
        drawGraph(tokenPriceData);
    } catch (error) {
        console.error("Could not fetch token prices: ", error);
    }
}

async function updateGraph(timeRange) {
    try {
        const response = await fetch(`/graph-data?timeRange=${timeRange}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Received data:", data);
        drawGraph(data);
    } catch (error) {
        console.error("Could not update graph: ", error);
    }
}

function drawGraph(data) {
    // Clear the existing graph
    d3.select("#chart").selectAll("*").remove();

    const containerWidth = d3.select(".chart-area").node().getBoundingClientRect().width;

    const aspectRatio = 600 / 1400;
    const height = containerWidth * aspectRatio;

    // Set up the dimensions and margins of the graph
    const margin = { top: 20, right: 100, bottom: 30, left: 70 };
    const width = containerWidth - margin.left - margin.right;

    // Append an SVG element to the body
    const svg = d3
        .select("#chart")
        .attr("width", containerWidth)
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
    let tooltip = d3.select(".tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div").attr("class", "tooltip");
    } else {
        tooltip.html("");
    }

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

    tooltip
        .html(
            `
        <div class="tooltip-content">
            <div class="price-container">
                <span>Price: ${d.price}</span>
                <img src="images/coin-gold.png" alt="WoW Gold" class="gold-icon">
            </div>
            <span>Date: ${moment(d.timestamp).format("YYYY-MM-DD hh:mm A")}</span>
        </div>
    `
        )
        .style("left", `${tooltipX}px`)
        .style("top", `${tooltipY - 70}px`);

    // Create or update the vertical line
    let verticalLine = svg.select(".vertical-line");
    if (verticalLine.empty()) {
        verticalLine = svg
            .append("line")
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

// Time filter button click event handler
function handleTimeFilterClick(event) {
    const buttons = document.querySelectorAll("#time-filters button");
    buttons.forEach((button) => button.classList.remove("active"));
    event.target.classList.add("active");
    updateGraph(event.target.dataset.timeRange);
}

async function fetchAndDisplayTrends() {
    const response = await fetch("/trend-data");
    const data = await response.json();
    updateTrendDisplay(data.trends);
}

function updateTrendDisplay(trends) {
    const trendContainer = document.getElementById("trend-details");
    trendContainer.innerHTML = Object.keys(trends)
        .map((range) => {
            const trend = trends[range];
            const percentChangeText =
                parseFloat(trend.percentChange) > 0
                    ? `+${trend.percentChange}`
                    : trend.percentChange;
            const colorClass =
                parseFloat(trend.percentChange) > 0 ? "text-green" : "text-red";

            if (range === '30m') {
                updateRecommendations(parseFloat(trend.percentChange));
            }
            return `
            <div class="trend-row">
                <h3 class="trend-title">${range.toUpperCase()}</h3>
                <p>Start: <span class="trend-start">${trend.start}</span></p>
                <p>Current: <span class="trend-current">${trend.current}</span></p>
                <p>Change: <span class="${colorClass}">${percentChangeText}</span></p>
            </div>
        `;
        })
        .join("");
}

function displayUpdateTimeDetails(data) {
    // Assuming the last entry in the data array is the most recent update
    const lastUpdateTimestamp = new Date(data[0].timestamp);
    const now = new Date();

    const lastUpdateFormatted = lastUpdateTimestamp.toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    // Calculate the difference in minutes
    const diffMinutes = Math.round((now - lastUpdateTimestamp) / 60000);
    const timeUntilNextUpdate = 30 - (diffMinutes % 30); // Time until the next 30-minute interval

    // Display the times in the HTML
    document.getElementById("last-update").innerText =
        `Last update: ${lastUpdateFormatted}`;
    document.getElementById("time-until-next-update").innerText =
        `Time until next update: ${timeUntilNextUpdate} minutes`;
}

function updateRecommendations(percentChange) {
    const sellRecommendationElement = document.getElementById(
        "sell-recommendation"
    );
    const buyRecommendationElement =
        document.getElementById("buy-recommendation");

    let sellRecommendation = "Wait";
    let buyRecommendation = "Wait";

    console.log(percentChange);

    if (percentChange < -0.3) {
        sellRecommendation = "Sell";
    } else if (percentChange > 0.3) {
        buyRecommendation = "Buy";
    }

    sellRecommendationElement.textContent = sellRecommendation;
    buyRecommendationElement.textContent = buyRecommendation;

    sellRecommendationElement.classList.remove("text-red", "text-green");
    buyRecommendationElement.classList.remove("text-red", "text-green");
  
    if (sellRecommendation === "Wait") {
      sellRecommendationElement.classList.add("text-red");
    } else if (sellRecommendation === "Sell") {
      sellRecommendationElement.classList.add("text-green");
    }
  
    if (buyRecommendation === "Wait") {
      buyRecommendationElement.classList.add("text-red");
    } else if (buyRecommendation === "Buy") {
      buyRecommendationElement.classList.add("text-green");
    }
}

// Attach click event listeners to time filter buttons
document.querySelectorAll("#time-filters button").forEach((button) => {
    button.addEventListener("click", handleTimeFilterClick);
});

document.querySelector("[data-time-range='24h']").classList.add("active");

document.addEventListener("DOMContentLoaded", () => {
    getTokenPrice();
    fetchAndDisplayTrends();
});

window.addEventListener("resize", () => {
    drawGraph(tokenPriceData);
});