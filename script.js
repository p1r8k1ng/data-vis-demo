fetch('data.json')
    .then(response => response.json())
    .then(data => {
        const width = 800;
        const height = 600;

        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        // Extract unique node types and relationship types
        const uniqueTypes = new Set(data.artefacts.map(node => node.type));
        const uniqueRelationshipTypes = new Set(data.relationships.map(link => link.type));

        // Generate checkboxes for node types
        const typeCheckboxes = d3.select("#type-checkboxes")
            .selectAll("input")
            .data(Array.from(uniqueTypes))
            .enter()
            .append("div")
            .html(type => `<input type="checkbox" id="type-${type}" data-type="${type}" checked> <label for="type-${type}">${type}</label>`);

        // Generate checkboxes for relationship types
        const relationshipCheckboxes = d3.select("#relationship-checkboxes")
            .selectAll("input")
            .data(Array.from(uniqueRelationshipTypes))
            .enter()
            .append("div")
            .html(type => `<input type="checkbox" id="relationship-${type}" data-type="${type}" checked> <label for="relationship-${type}">${type}</label>`);

        // Calculate node degree
        const degrees = {};
        data.artefacts.forEach(node => {
            degrees[node.id] = 0;
        });

        data.relationships.forEach(link => {
            degrees[link.source] = (degrees[link.source] || 0) + 1;
            degrees[link.target] = (degrees[link.target] || 0) + 1;
        });

        // Attach degree to nodes
        data.artefacts.forEach(node => {
            node.degree = degrees[node.id] || 0;
        });

        const simulation = d3.forceSimulation(data.artefacts)
            .force("link", d3.forceLink(data.relationships).id(d => d.id))
            .force("charge", d3.forceManyBody().strength(-400))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .selectAll("line")
            .data(data.relationships)
            .join("line")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", 2);

        const node = svg.append("g")
            .selectAll("circle")
            .data(data.artefacts)
            .join("circle")
            .attr("r", d => 5 + d.degree * 5) // Node size based on degree
            .attr("fill", "steelblue")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2)
            .call(d3.drag() 
                .on("start", dragStarted)
                .on("drag", dragged)
                .on("end", dragEnded));

        node.on("mouseover", (event, d) => {
            tooltip.transition()
                .duration(200)
                .style("opacity", 1);
            tooltip.html(`<strong>${d.title}</strong><br>Type: ${d.type}<br>Connections: ${d.degree}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        }).on("mouseout", () => {
            tooltip.transition()
                .duration(200)
                .style("opacity", 0);
        });

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

        // Add event listeners for checkboxes to filter nodes and links
        d3.selectAll("#type-checkboxes input").on("change", function() {
            updateFilters();
        });

        d3.selectAll("#relationship-checkboxes input").on("change", function() {
            updateFilters();
        });

        function updateFilters() {
            const selectedTypes = d3.selectAll("#type-checkboxes input:checked")
                .map(input => input.getAttribute('data-type'))[0];

            const selectedRelationshipTypes = d3.selectAll("#relationship-checkboxes input:checked")
                .map(input => input.getAttribute('data-type'))[0];

            link.style("display", d => {
                if (selectedRelationshipTypes.includes(d.type)) {
                    return null;
                } else {
                    return "none";
                }
            });

            node.style("display", d => {
                if (selectedTypes.includes(d.type)) {
                    return null;
                } else {
                    return "none";
                }
            });

            // Restart the simulation with the filtered nodes and links
            simulation.nodes(data.artefacts)
                .on("tick", () => {
                    link
                        .attr("x1", d => d.source.x)
                        .attr("y1", d => d.source.y)
                        .attr("x2", d => d.target.x)
                        .attr("y2", d => d.target.y);

                    node
                        .attr("cx", d => d.x)
                        .attr("cy", d => d.y);
                });

            simulation.force("link")
                .links(data.relationships.filter(d => selectedRelationshipTypes.includes(d.type)));

            simulation.alpha(1).restart();
        }
    });