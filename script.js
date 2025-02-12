fetch('https://linked.art/ns/v1/linked-art.json')
    .then(response => response.json())
    .then(data => {
        console.log("API Response:", data); // Debugging 

        const width = 900;
        const height = 700;

        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        let nodes = [];
        let links = [];

        // Extract entities dynamically
        for (const key in data) {
            if (Array.isArray(data[key])) {
                data[key].forEach(item => {
                    if (item["@type"] === "HumanMadeObject") {
                        nodes.push({ ...item, type: "Artefact" });
                    } else if (item["@type"] === "Person" || item["@type"] === "Group") {
                        nodes.push({ ...item, type: "Actor" });
                    } else if (item["@type"] === "Activity") {
                        nodes.push({ ...item, type: "Event" });
                    }
                });
            }
        }

        // Extract relationships dynamically
        nodes.forEach(node => {
            if (node["produced_by"]) {
                links.push({
                    source: node.id,
                    target: node["produced_by"]["@id"],
                    label: "Created by"
                });
            }
            if (node["current_location"]) {
                links.push({
                    source: node.id,
                    target: node["current_location"]["@id"],
                    label: "Located at"
                });
            }
        });

        // Check if nodes and links exist
        if (nodes.length === 0) {
            console.error("No nodes found. API might not contain the expected data.");
            return;
        }
        if (links.length === 0) {
            console.warn("No links found. Relationships might not be properly defined.");
        }

        // Set up force simulation
        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(150))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));

        // Draw links
        const link = svg.append("g")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke", "#aaa")
            .attr("stroke-opacity", 0.8)
            .attr("stroke-width", 2);

        // Draw nodes
        const node = svg.append("g")
            .selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("r", 8)
            .attr("fill", d => {
                if (d.type === "Artefact") return "steelblue";
                if (d.type === "Actor") return "darkgreen";
                if (d.type === "Event") return "crimson";
                return "gray";
            })
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .call(d3.drag()
                .on("start", dragStarted)
                .on("drag", dragged)
                .on("end", dragEnded));

        // Hover tooltips
        node.on("mouseover", (event, d) => {
            tooltip.transition()
                .duration(200)
                .style("opacity", 1);
            tooltip.html(`<strong>${d.label || d.id}</strong><br>Type: ${d.type}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        }).on("mouseout", () => {
            tooltip.transition()
                .duration(200)
                .style("opacity", 0);
        });

        // Update simulation
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

    })
    .catch(error => console.error("Error fetching data:", error));
