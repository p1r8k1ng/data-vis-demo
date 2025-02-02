fetch('data.json')
    .then(response => response.json())
    .then(data => {
        const width = 900;
        const height = 700;

        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        // Extract all nodes
        const nodes = [
            ...data.artefacts.map(a => ({ ...a, type: "Artefact" })),
            ...data.creators.map(c => ({ ...c, type: "Creator" })),
            ...data.events.map(e => ({ ...e, type: "Event" }))
        ];

        // Extract relationships (links)
        const links = [];

        // Artefact -> Creator relationships
        data.artefacts.forEach(a => {
            if (a.produced_by) {
                links.push({
                    source: a.id,
                    target: a.produced_by.id,
                    label: "created by"
                });
            }
        });

        // Event-based influence relationships
        data.events.forEach(event => {
            if (event.carried_out_by && event.participated_by) {
                links.push({
                    source: event.carried_out_by.id,
                    target: event.id,
                    label: "influenced"
                });
                links.push({
                    source: event.id,
                    target: event.participated_by.id,
                    label: "was influenced by"
                });
            }
        });

        // Calculate node degree
        const degrees = {};
        nodes.forEach(node => {
            degrees[node.id] = 0;
        });

        links.forEach(link => {
            degrees[link.source] = (degrees[link.source] || 0) + 1;
            degrees[link.target] = (degrees[link.target] || 0) + 1;
        });

        // Attach degree to nodes
        nodes.forEach(node => {
            node.degree = degrees[node.id] || 0;
        });

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
            .attr("r", d => 6 + d.degree * 4) // Node size based on connections
            .attr("fill", d => {
                if (d.type === "Artefact") return "steelblue";
                if (d.type === "Creator") return "darkgreen";
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
            tooltip.html(`<strong>${d.label}</strong><br>Type: ${d.type}<br>Connections: ${d.degree}`)
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
    });
