const API_KEY = "renscarklone"; // Sam's Europeana key
const API_URL = `https://api.europeana.eu/record/v2/search.json?wskey=${API_KEY}&query=art&rows=50`;

fetch(API_URL)
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

        // Process API Data into Nodes and Links
        const nodes = [];
        const links = [];

        const artefactMap = {}; // Store artefact info

        data.items.forEach((item, index) => {
            if (!item.title || !item.guid) return; // Skip if no title or ID

            let artefact = {
                id: item.guid,
                title: item.title[0],
                type: "Artefact",
                degree: 0
            };

            nodes.push(artefact);
            artefactMap[item.guid] = artefact;

            if (item.edmAgent) {
                item.edmAgent.forEach((creator, cIndex) => {
                    let creatorId = `${item.guid}-creator-${cIndex}`;
                    let creatorNode = {
                        id: creatorId,
                        title: creator.prefLabel || "Unknown Creator",
                        type: "Creator",
                        degree: 0
                    };

                    nodes.push(creatorNode);
                    links.push({ source: artefact.id, target: creatorId, label: "created by" });

                    artefact.degree += 1;
                    creatorNode.degree += 1;
                });
            }
        });

        // Calculate node sizes
        nodes.forEach(node => {
            node.degree = node.degree || 0;
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
            .attr("r", d => 6 + d.degree * 4) // Size based on connections
            .attr("fill", d => (d.type === "Artefact" ? "steelblue" : "darkgreen"))
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
            tooltip.html(`<strong>${d.title}</strong><br>Type: ${d.type}<br>Connections: ${d.degree}`)
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
