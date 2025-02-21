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
    const svg = d3.select("#graph")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

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

    //  populating the time period dropdown
    const timePeriodsSet = new Set();

    // Group artworks by creator and time period.
    // Structure: { creatorKey: { timePeriod: [artworkNodes] } }
    const creatorTimeMap = {};

    items.forEach(item => {
      if (item.edmIsShownBy && item.edmIsShownBy.length > 0) {
        const title = getTitle(item);
        const creatorLabel = getCreatorLabel(item);
        const timePeriod = getTimePeriod(item);
        timePeriodsSet.add(timePeriod);

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

    // Create TimePeriod nodes and link them to their creators and artworks.
    Object.keys(creatorTimeMap).forEach(creatorKey => {
      const timeObj = creatorTimeMap[creatorKey];
      Object.keys(timeObj).forEach(timePeriod => {
        const timeNodeId = `time-${creatorKey}-${timePeriod.replace(/\s+/g, "")}`;
        const timeNode = {
          id: timeNodeId,
          label: timePeriod,
          type: "TimePeriod"
        };
        nodes.push(timeNode);
        links.push({
          source: creatorsMap[creatorKey].id,
          target: timeNodeId,
          label: "active in"
        });
        creatorTimeMap[creatorKey][timePeriod].forEach(artworkNode => {
          links.push({
            source: timeNodeId,
            target: artworkNode.id,
            label: "created in"
          });
        });
      });
    });

    // Link creator nodes directly to the provider node.
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

    // Populate the Time Period dropdown.
    const institutionSelect = document.getElementById("institution");
    timePeriodsSet.forEach(period => {
      const option = document.createElement("option");
      option.value = period;
      option.textContent = period;
      institutionSelect.appendChild(option);
    });

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

    // Set up the full force simulation.
    let simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links)
        .id(d => d.id)
        .distance(link => {
          if (link.label === "affiliated with") return 250;
          if (link.label === "active in") return 150;
          if (link.label === "created in") return 75;
          return 150;
        }))
      .force("charge", d3.forceManyBody().strength(-50))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Draw links and nodes (initially, full graph).
    const linkGroup = svg.append("g").attr("class", "links");
    const nodeGroup = svg.append("g").attr("class", "nodes");

    let linkSel = linkGroup.selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#aaa")
      .attr("stroke-opacity", 0.8)
      .attr("stroke-width", 2);

    let nodeSel = nodeGroup.selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => {
        if (d.type === "Provider") return 20;
        if (d.type === "Creator") return 10;
        if (d.type === "TimePeriod") return 15;
        return 12;
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

    // Tooltip events.
    nodeSel.on("mouseover", (event, d) => {
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

      tooltip.transition().duration(200).style("opacity", 1);
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
      tooltip.transition().duration(200).style("opacity", 0);
    });

    simulation.on("tick", () => {
      linkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      nodeSel
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

    // -------------------------------
    // Filtering: Reset and redraw graph based on selected time period.
    // -------------------------------
    document.getElementById("applyFilters").addEventListener("click", () => {
      const selectedTime = institutionSelect.value;
      // If "All" is selected, restore full graph.
      if (selectedTime === "all") {
        location.reload();
        return;
      }

      // Build filtered lists:
      const filteredNodes = [];
      const filteredLinks = [];
      const filteredNodeIds = new Set();

      // Always include the provider node.
      if (providerNode) {
        filteredNodes.push(providerNode);
        filteredNodeIds.add(providerNode.id);
      }

      // Find the time period node that matches the selected time.
      const selectedTimeNode = nodes.find(n => n.type === "TimePeriod" && n.label === selectedTime);
      if (selectedTimeNode) {
        filteredNodes.push(selectedTimeNode);
        filteredNodeIds.add(selectedTimeNode.id);

        // Include artwork nodes that have this time period.
        nodes.filter(n => n.type === "Artwork" && n.timePeriod === selectedTime)
          .forEach(artNode => {
            filteredNodes.push(artNode);
            filteredNodeIds.add(artNode.id);
          });

        //  include creator nodes that are linked to this time node.
        links.filter(l => {
          //  l.source or l.target = objects or ids.
          const sourceId = typeof l.source === "object" ? l.source.id : l.source;
          const targetId = typeof l.target === "object" ? l.target.id : l.target;
          return (targetId === selectedTimeNode.id && l.label === "active in");
        }).forEach(l => {
          const creatorNode = nodes.find(n => n.id === (typeof l.source === "object" ? l.source.id : l.source));
          if (creatorNode) {
            filteredNodes.push(creatorNode);
            filteredNodeIds.add(creatorNode.id);
          }
        });
      }

      // Filter links connecting only filtered nodes.
      links.forEach(l => {
        const sourceId = typeof l.source === "object" ? l.source.id : l.source;
        const targetId = typeof l.target === "object" ? l.target.id : l.target;
        if (filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId)) {
          filteredLinks.push(l);
        }
      });

      // Clear  current svg content.
      svg.selectAll("*").remove();

      // Recreate patterns for artwork nodes.
      const newDefs = svg.append("defs");
      filteredNodes.forEach(d => {
        if (d.type === "Artwork" && d.image) {
          newDefs.append("pattern")
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

      // Create separate groups so links are drawn behind nodes.
      const newLinkGroup = svg.append("g").attr("class", "links");
      const newNodeGroup = svg.append("g").attr("class", "nodes");

      // Recreate the force simulation with filtered data.
      simulation = d3.forceSimulation(filteredNodes)
        .force("link", d3.forceLink(filteredLinks)
          .id(d => d.id)
          .distance(link => {
            if (link.label === "affiliated with") return 250;
            if (link.label === "active in") return 150;
            if (link.label === "created in") return 75;
            return 150;
          }))
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(width / 2, height / 2));

      // Redraw links.
      const newLinkSel = newLinkGroup.selectAll("line")
        .data(filteredLinks)
        .join("line")
        .attr("stroke", "#aaa")
        .attr("stroke-opacity", 0.8)
        .attr("stroke-width", 2);

      // Redraw nodes.
      const newNodeSel = newNodeGroup.selectAll("circle")
        .data(filteredNodes)
        .join("circle")
        .attr("r", d => {
          if (d.type === "Provider") return 20;
          if (d.type === "Creator") return 10;
          if (d.type === "TimePeriod") return 15;
          return 12;
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

      // Tooltip events for filtered nodes.
      newNodeSel.on("mouseover", (event, d) => {
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

        tooltip.transition().duration(200).style("opacity", 1);
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
        tooltip.transition().duration(200).style("opacity", 0);
      });

      simulation.on("tick", () => {
        newLinkSel
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
        newNodeSel
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);
      });

      simulation.alpha(1).restart();

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
  })
  .catch(error => console.error("Error fetching data:", error));
