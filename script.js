// Load the data
fetch('data.json')
    .then(response => response.json())
    .then(data => {
        const width = 800;
        const height = 600;

        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Force simulation for the graph layout
        const simulation = d3.forceSimulation(data.artefacts)
            .force("link", d3.forceLink(data.relationships).id(d => d.id))
            .force("charge", d3.forceManyBody().strength(-100))
            .force("center", d3.forceCenter(width / 2, height / 2));

        // Add links (edges)
        const link = svg.append("g")
            .selectAll("line")
            .data(data.relationships)
            .join("line")
            .attr("stroke", "#999")
            .attr("stroke-width", 2);

        // Add nodes
        const node = svg.append("g")
            .selectAll("circle")
            .data(data.artefacts)
            .join("circle")
            .attr("r", 10)
            .attr("fill", "steelblue")
            .call(d3.drag()
                .on("start", dragStarted)
                .on("drag", dragged)
                .on("end", dragEnded));

        // Add dynamic tooltips
        node.on("mouseover", (event, d) => {
            showTooltip(event, `${d.title} (${d.type})`);
        }).on("mouseout", hideTooltip);

        // Tooltip container
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("background", "#fff")
            .style("padding", "5px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "5px")
            .style("pointer-events", "none")
            .style("opacity", 0);

        function showTooltip(event, text) {
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(text)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        }

        function hideTooltip() {
            tooltip.transition().duration(200).style("opacity", 0);
        }

        // Simulation updates
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });

        // Drag functions
        function dragStarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragEnded(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
    });
