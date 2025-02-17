const API_KEY = "renscarklone"; //fix - only fetches connected artists
const API_URL = `https://api.europeana.eu/record/v2/search.json?query=who:*&profile=standard&media=true&wskey=${API_KEY}&rows=50`;

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

        const items = data.items || [];
        const nodes = [];
        const links = [];
        const creatorsMap = {};

        // Extract artworks and create connections via creators
        items.forEach(item => {
            if (item.title && item.edmIsShownBy && item.dcCreator) {
                const artworkNode = {
                    id: item.id,
                    label: item.title[0],
                    type: "Artwork",
                    image: item.edmIsShownBy[0],
                    creator: item.dcCreator[0]
                };
                nodes.push(artworkNode);

                const creatorName = item.dcCreator[0];

                if (!creatorsMap[creatorName]) {
                    creatorsMap[creatorName] = {
                        id: `creator-${creatorName}`,
                        label: creatorName,
                        type: "Creator"
                    };
                    nodes.push(creatorsMap[creatorName]);
                }

                links.push({
                    source: artworkNode.id,
                    target: creatorsMap[creatorName].id,
                    label: "created by"
                });
            }
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
            .attr("r", d => (d.type === "Creator" ? 10 : 6))
            .attr("fill", d => (d.type === "Creator" ? "darkgreen" : "steelblue"))
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
            tooltip.html(`<strong>${d.label}</strong><br>Type: ${d.type}`)
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
