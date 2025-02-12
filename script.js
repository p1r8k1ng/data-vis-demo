fetch('https://linked.art/ns/v1/linked-art.json')
    .then(response => response.json())
    .then(data => {
        console.log("Fetched Data:", data); // Debugging

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

        // Extract entities from API response
        if (data["E22_Human-Made_Object"]) {
            nodes.push(...data["E22_Human-Made_Object"].map(a => ({ ...a, type: "Artefact" })));
        }
        if (data["E39_Actor"]) {
            nodes.push(...data["E39_Actor"].map(a => ({ ...a, type: "Actor" })));
        }
        if (data["E74_Group"]) {
            nodes.push(...data["E74_Group"].map(a => ({ ...a, type: "Institution" })));
        }
        if (data["E5_Event"]) {
            nodes.push(...data["E5_Event"].map(e => ({ ...e, type: "Event" })));
        }

        // Build relationships (links)
        if (data["E22_Human-Made_Object"]) {
            data["E22_Human-Made_Object"].forEach(artwork => {
                if (artwork["P108i_was_produced_by"]) {
                    links.push({
                        source: artwork.id,
                        target: artwork["P108i_was_produced_by"].id,
                        label: "Created by"
                    });
                }
                if (artwork["P55_has_current_location"]) {
                    links.push({
                        source: artwork.id,
                        target: artwork["P55_has_current_location"].id,
                        label: "Located at"
                    });
                }
            });
        }

        if (data["E5_Event"]) {
            data["E5_Event"].forEach(event => {
                if (event["P14_carried_out_by"]) {
                    links.push({
                        source: event.id,
                        target: event["P14_carried_out_by"].id,
                        label: "Carried out by"
                    });
                }
            });
        }

        // Calculate node degree
        const degrees = {};
        nodes.forEach(node => { degrees[node.id] = 0; });
        links.forEach(link => {
            degrees[link.source] = (degrees[link.source] || 0) + 1;
            degrees[link.target] = (degrees[link.target] || 0) + 1;
        });

        nodes.forEach(node => { node.degree = degrees[node.id] || 0; });

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
                if (d.type === "Actor") return "darkgreen";
                if (d.type === "Institution") return "purple";
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
            tooltip.html(`<strong>${d.label || d.id}</strong><br>Type: ${d.type}<br>Connections: ${d.degree}`)
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

        // Populate filter dropdowns dynamically
        function populateFilters() {
            const artistSelect = document.getElementById("artist");
            const institutionSelect = document.getElementById("institution");

            if (data["E39_Actor"]) {
                const uniqueArtists = [...new Set(data["E39_Actor"].map(a => a.label))];
                uniqueArtists.forEach(artist => {
                    const option = document.createElement("option");
                    option.value = artist;
                    option.textContent = artist;
                    artistSelect.appendChild(option);
                });
            }

            if (data["E74_Group"]) {
                const uniqueInstitutions = [...new Set(data["E74_Group"].map(i => i.label))];
                uniqueInstitutions.forEach(inst => {
                    const option = document.createElement("option");
                    option.value = inst;
                    option.textContent = inst;
                    institutionSelect.appendChild(option);
                });
            }
        }
        populateFilters();
    })
    .catch(error => console.error("Error fetching data:", error));
