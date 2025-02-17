const API_KEY = "renscarklone";
const ARTIST_QUERY = "Rembrandt";  // Broader query to get more records
const PROVIDER = "Rijksmuseum";
const API_URL = `https://api.europeana.eu/record/v2/search.json?wskey=${API_KEY}&query=${encodeURIComponent(ARTIST_QUERY)}&profile=standard&media=true&rows=50&qf=DATA_PROVIDER:(${encodeURIComponent(PROVIDER)})`;

fetch(API_URL)
  .then(response => response.json())
  .then(data => {
    console.log("API Response:", data); // Debug: log API response

    const width = 900;
    const height = 700;

    const svg = d3.select("#graph")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    // Create tooltip with inline styles
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("opacity", 0)
      .style("position", "absolute")
      .style("background-color", "white")
      .style("border", "1px solid #ccc")
      .style("padding", "5px")
      .style("font-size", "12px")
      .style("pointer-events", "none");

    // Process API data into nodes and links
    const items = data.items || [];
    const nodes = [];
    const links = [];
    const creatorsMap = {};
    let providerNode = null;

    // Create a common provider node based on the DATA_PROVIDER field
    if (items.length > 0 && items[0].dataProvider && items[0].dataProvider.length > 0) {
      providerNode = {
        id: `provider-${items[0].dataProvider[0]}`,
        label: items[0].dataProvider[0],
        type: "Provider"
      };
      nodes.push(providerNode);
    }

    // Process each record to create artwork and creator nodes, linking them to the provider node.
    items.forEach(item => {
      // Check that essential fields exist.
      if (item.title && item.edmIsShownBy && (item.dcCreator || item.proxy_dc_creator)) {
        // Prefer dcCreator; if not, fall back to proxy_dc_creator.
        const creatorText = (item.dcCreator && item.dcCreator.length > 0) 
                              ? item.dcCreator[0] 
                              : (item.proxy_dc_creator && item.proxy_dc_creator.length > 0 ? item.proxy_dc_creator[0] : "Unknown Creator");
                              
        const artworkNode = {
          id: item.id,
          label: item.title[0],
          type: "Artwork",
          image: item.edmIsShownBy[0],
          creator: creatorText
        };
        nodes.push(artworkNode);

        // Normalize the creator name for grouping.
        const creatorKey = creatorText.trim().toLowerCase();
        if (!creatorsMap[creatorKey]) {
          creatorsMap[creatorKey] = {
            id: `creator-${creatorKey}`,
            label: creatorText,
            type: "Creator"
          };
          nodes.push(creatorsMap[creatorKey]);
        }

        // Link artwork to its creator.
        links.push({
          source: artworkNode.id,
          target: creatorsMap[creatorKey].id,
          label: "created by"
        });

        // Link artwork to the common provider node.
        if (providerNode) {
          links.push({
            source: artworkNode.id,
            target: providerNode.id,
            label: "provided by"
          });
        }
      }
    });

    console.log("Processed nodes:", nodes);
    console.log("Processed links:", links);

    // Create SVG patterns for artwork nodes with images.
    const defs = svg.append("defs");
    nodes.forEach(d => {
      if (d.type === "Artwork" && d.image) {
        defs.append("pattern")
          .attr("id", "pattern-" + d.id)
          .attr("width", 1)
          .attr("height", 1)
          .append("image")
          .attr("xlink:href", d.image)
          .attr("width", 20)         // Adjust as needed
          .attr("height", 20)        // Adjust as needed
          .attr("preserveAspectRatio", "xMidYMid slice");
      }
    });

    // Set up force simulation.
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Draw links.
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#aaa")
      .attr("stroke-opacity", 0.8)
      .attr("stroke-width", 2);

    // Draw nodes.
    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => {
        if (d.type === "Provider") return 12;
        if (d.type === "Creator") return 10;
        return 12;  // Artwork nodes.
      })
      .attr("fill", d => {
        if (d.type === "Artwork" && d.image) {
          return "url(#pattern-" + d.id + ")";
        } else if (d.type === "Provider") {
          return "gold";
        } else if (d.type === "Creator") {
          return "darkgreen";
        }
        return "steelblue";
      })
      .attr("stroke", d => {
        if (d.type === "Artwork") return "steelblue";
        if (d.type === "Provider") return "gold";
        if (d.type === "Creator") return "darkgreen";
        return "#fff";
      })
      .attr("stroke-width", 2)
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded));

    // Hover tooltips and node enlargement.
    node.on("mouseover", (event, d) => {
      d3.select(event.currentTarget)
        .transition()
        .duration(200)
        .attr("r", function() {
          if (d.type === "Provider") return 12 * 1.5;
          if (d.type === "Creator") return 10 * 1.5;
          return 12 * 1.5;
        });

      let tooltipContent = `<strong>${d.label}</strong><br>Type: ${d.type}`;
      if (d.type === "Artwork" && d.image) {
        tooltipContent = `<img src="${d.image}" width="150" height="150" style="display:block;margin-bottom:5px;">` + tooltipContent;
      }
      
      tooltip.transition()
        .duration(200)
        .style("opacity", 1);
      tooltip.html(tooltipContent)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");
    }).on("mouseout", (event, d) => {
      d3.select(event.currentTarget)
        .transition()
        .duration(200)
        .attr("r", function() {
          if (d.type === "Provider") return 12;
          if (d.type === "Creator") return 10;
          return 12;
        });
      
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
  })
  .catch(error => console.error("Error fetching data:", error));
