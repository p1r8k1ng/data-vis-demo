const API_KEY = "renscarklone";
const ARTIST_QUERY = "Rembrandt van Rijn";  // The artist we're targeting
const PROVIDER = "Rijksmuseum";              // Using Rijksmuseum as DATA_PROVIDER
const API_URL = `https://api.europeana.eu/record/v2/search.json?wskey=${API_KEY}&query=who:(${encodeURIComponent(ARTIST_QUERY)})&qf=DATA_PROVIDER:(%22${encodeURIComponent(PROVIDER)}%22)&profile=standard&media=true&rows=50&sort=score+desc`;

// Helper: Get title with fallback.
function getTitle(item) {
  if (item.title && item.title.length > 0) return item.title[0];
  if (item.dcTitleLangAware && item.dcTitleLangAware.def && item.dcTitleLangAware.def.length > 0)
    return item.dcTitleLangAware.def[0];
  return "Untitled";
}

// Helper: Get a human-readable creator label.
function getCreatorLabel(item) {
  if (item.dcCreatorLangAware) {
    const langKeys = Object.keys(item.dcCreatorLangAware);
    if (langKeys.length > 0 && item.dcCreatorLangAware[langKeys[0]].length > 0) {
      const label = item.dcCreatorLangAware[langKeys[0]][0];
      if (label.toLowerCase() === "anonymous" || label.toLowerCase() === "anoniem") {
         return ARTIST_QUERY;
      }
      return label;
    }
  }
  if (item.dcCreator && item.dcCreator.length > 0) {
    const candidate = item.dcCreator[0];
    if (candidate.toLowerCase() === "anonymous" || candidate.toLowerCase() === "anoniem") {
      return ARTIST_QUERY;
    }
    if (candidate.startsWith("http")) {
      if (item.proxy_dc_creatorLangAware) {
        const keys = Object.keys(item.proxy_dc_creatorLangAware);
        if (keys.length > 0 && item.proxy_dc_creatorLangAware[keys[0]].length > 0) {
          return item.proxy_dc_creatorLangAware[keys[0]][0];
        }
      }
      if (item.proxy_dc_creator && item.proxy_dc_creator.length > 0) {
        return item.proxy_dc_creator[0];
      }
      return ARTIST_QUERY;
    }
    return candidate;
  }
  return ARTIST_QUERY;
}

// Helper: Get time period label from edmTimespanLabel.
function getTimePeriod(item) {
  if (item.edmTimespanLabel && item.edmTimespanLabel.length > 0) {
    // Assume the first value's "def" property is our time period.
    return item.edmTimespanLabel[0].def || "Unknown Period";
  }
  return "Unknown Period";
}

fetch(API_URL)
  .then(response => response.json())
  .then(data => {
    console.log("API Response:", data);

    const width = 900;
    const height = 700;

    // Create the SVG container.
    const svg = d3.select("#graph")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    // Create a tooltip.
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("opacity", 0)
      .style("position", "absolute")
      .style("background-color", "white")
      .style("border", "1px solid #ccc")
      .style("padding", "5px")
      .style("font-size", "12px")
      .style("pointer-events", "none");

    const items = data.items || [];
    const nodes = [];
    const links = [];
    const creatorsMap = {};

    let providerNode = null;

    // Create the provider (museum) node.
    if (items.length > 0 && items[0].dataProvider && items[0].dataProvider.length > 0) {
      providerNode = {
        id: `provider-${items[0].dataProvider[0]}`,
        label: items[0].dataProvider[0],
        type: "Provider"
      };
      nodes.push(providerNode);
    }

    // building a grouping for artworks by creator and time period.
    // Structure: { creatorKey: { timePeriod: [artworkNodes] } }
    const creatorTimeMap = {};

    // Process each record to create artwork nodes and link them to time period.
    items.forEach(item => {
      if (item.edmIsShownBy && item.edmIsShownBy.length > 0) {
        const title = getTitle(item);
        const creatorLabel = getCreatorLabel(item);
        const timePeriod = getTimePeriod(item);

        const artworkNode = {
          id: item.id,
          label: title,
          type: "Artwork",
          image: item.edmIsShownBy[0],
          creator: creatorLabel,
          timePeriod: timePeriod
        };
        nodes.push(artworkNode);

        // Normalise creator for grouping.
        const creatorKey = creatorLabel.trim().toLowerCase();
        if (!creatorsMap[creatorKey]) {
          creatorsMap[creatorKey] = {
            id: `creator-${creatorKey}`,
            label: creatorLabel,
            type: "Creator"
          };
          nodes.push(creatorsMap[creatorKey]);
        }
        

        // Build creatorTimeMap.
        if (!creatorTimeMap[creatorKey]) {
          creatorTimeMap[creatorKey] = {};
        }
        if (!creatorTimeMap[creatorKey][timePeriod]) {
          creatorTimeMap[creatorKey][timePeriod] = [];
        }
        creatorTimeMap[creatorKey][timePeriod].push(artworkNode);
      }
    });

    // create a TimePeriod node.
    //  link the Creator node to the TimePeriod node,
    //  link  TimePeriod node to each artwork.
    Object.keys(creatorTimeMap).forEach(creatorKey => {
      const timeObj = creatorTimeMap[creatorKey];
      Object.keys(timeObj).forEach(timePeriod => {
        // Create a unique time node per creator & time period.
        const timeNodeId = `time-${creatorKey}-${timePeriod.replace(/\s+/g, "")}`;
        const timeNode = {
          id: timeNodeId,
          label: timePeriod,
          type: "TimePeriod"
        };
        nodes.push(timeNode);
        // Link the creator to the time node.
        links.push({
          source: creatorsMap[creatorKey].id,
          target: timeNodeId,
          label: "active in"
        });
        // Link each artwork in this group to the time node.
        creatorTimeMap[creatorKey][timePeriod].forEach(artworkNode => {
          links.push({
            source: timeNodeId,
            target: artworkNode.id,
            label: "created in"
          });
        });
      });
    });

    //  link creator nodes directly to the provider node.
    Object.keys(creatorsMap).forEach(key => {
      if (providerNode) {
        links.push({
          source: creatorsMap[key].id,
          target: providerNode.id,
          label: "affiliated with"
        });
      }
    });

    console.log("Processed nodes:", nodes);
    console.log("Processed links:", links);

    // Create SVG patterns for artwork nodes.
    const defs = svg.append("defs");
    nodes.forEach(d => {
      if (d.type === "Artwork" && d.image) {
        defs.append("pattern")
          .attr("id", "pattern-" + d.id)
          .attr("width", 1)
          .attr("height", 1)
          .append("image")
          .attr("xlink:href", d.image)
          .attr("width", 20)
          .attr("height", 20)
          .attr("preserveAspectRatio", "xMidYMid slice");
      }
    });

    // Set up force simulation.
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(link => {
        // Set different distances based on link labels.
        if (link.label === "affiliated with") return 250;
        if (link.label === "active in") return 150;
        if (link.label === "created in") return 75;
        return 150;
      }))
      .force("charge", d3.forceManyBody().strength(-50))
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
        if (d.type === "Provider") return 20;
        if (d.type === "Creator") return 10;
        if (d.type === "TimePeriod") return 15;
        return 12;  // For artwork nodes.
      })
      .attr("fill", d => {
        if (d.type === "Artwork" && d.image) {
          return "url(#pattern-" + d.id + ")";
        } else if (d.type === "Provider") {
          return "gold";
        } else if (d.type === "Creator") {
          return "darkgreen";
        } else if (d.type === "TimePeriod") {
          return "cornflowerblue";
        }
        return "steelblue";
      })
      .attr("stroke", d => {
        if (d.type === "Artwork") return "steelblue";
        if (d.type === "Provider") return "gold";
        if (d.type === "Creator") return "darkgreen";
        if (d.type === "TimePeriod") return "cornflowerblue";
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
          if (d.type === "Provider") return 20 * 1.5;
          if (d.type === "Creator") return 10 * 1.5;
          if (d.type === "TimePeriod") return 15 * 1.5;
          return 12 * 1.5;
        });

      let tooltipContent = `<strong>${d.label}</strong><br>Type: ${d.type}`;
      if (d.type === "Artwork" && d.image) {
        tooltipContent = `<img src="${d.image}" width="150" height="150" style="display:block;margin-bottom:5px;">` + tooltipContent;
      }
      if (d.type === "TimePeriod") {
        tooltipContent = `<strong>Time Period:</strong> ${d.label}`;
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
          if (d.type === "Provider") return 20;
          if (d.type === "Creator") return 10;
          if (d.type === "TimePeriod") return 15;
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
