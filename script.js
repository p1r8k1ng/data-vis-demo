document.addEventListener("DOMContentLoaded", () => {
  const API_KEY = "renscarklone";
  const ARTIST_QUERY = "Johannes Vermeer";  // The artist we're targeting
  const PROVIDER = "Rijksmuseum";           // Using Rijksmuseum as DATA_PROVIDER
  const API_URL = `https://api.europeana.eu/record/v2/search.json?wskey=${API_KEY}&query=who:(${encodeURIComponent(ARTIST_QUERY)})&qf=DATA_PROVIDER:(%22${encodeURIComponent(PROVIDER)}%22)&profile=rich&media=true&rows=50&sort=score+desc`;

  // Helper: Get title with fallback.
  function getTitle(item) {
    if (item.title && item.title.length > 0) return item.title[0];
    if (item.dcTitleLangAware && item.dcTitleLangAware.def && item.dcTitleLangAware.def.length > 0) {
      return item.dcTitleLangAware.def[0];
    }
    return "Untitled";
  }

  // Helper: Get an array of artist names dynamically. 
  function getCreatorLabels(item) {
    if (item.edmAgentLabel && item.edmAgentLabel.length > 0) {
      const labels = item.edmAgentLabel.map(agent => agent.def).filter(name => name && name.trim() !== "");
      if (labels.length > 0) return labels;
    }
      //  fall back to dcCreator.
    if (item.dcCreator && item.dcCreator.length > 0) {
      return item.dcCreator;
    }
    return ["Unknown Artist"];
  }

  // Helper: Get time period label from edmTimespanLabel.
  function getTimePeriod(item) {
    if (item.edmTimespanLabel && item.edmTimespanLabel.length > 0) {
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

      // Append a zoomable container group.
      const container = svg.append("g");

      // Apply zoom behavior.
      svg.call(d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", event => {
          container.attr("transform", event.transform);
        }));

      // Create tooltip.
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
      const creatorsMap = {};  // normalised creator → Creator node
      const globalTimePeriods = new Map(); // key: time period string, value: time period node

      // Create Provider (museum) node.
      let providerNode = null;
      if (items.length > 0 && items[0].dataProvider && items[0].dataProvider.length > 0) {
        providerNode = {
          id: `provider-${items[0].dataProvider[0]}`,
          label: items[0].dataProvider[0],
          type: "Provider"
        };
        nodes.push(providerNode);
      }

      // Process each artwork.
      items.forEach(item => {
        if (item.edmIsShownBy && item.edmIsShownBy.length > 0) {
          const title = getTitle(item);
          const timePeriod = getTimePeriod(item);

          // Create Artwork node.
          const artworkNode = {
            id: item.id,
            label: title,
            type: "Artwork",
            image: item.edmIsShownBy[0],
            timePeriod: timePeriod
          };
          nodes.push(artworkNode);

          // Get all artist names.
          const creatorLabels = getCreatorLabels(item);

          // For each artist ensure Creator node, and link Creator -> Artwork.
          creatorLabels.forEach(creatorLabel => {
            const creatorKey = creatorLabel.trim().toLowerCase();
            if (!creatorsMap[creatorKey]) {
              creatorsMap[creatorKey] = {
                id: `creator-${creatorKey}`,
                label: creatorLabel,
                type: "Creator"
              };
              nodes.push(creatorsMap[creatorKey]);
            }
            // Link Creator → Artwork
            links.push({
              source: creatorsMap[creatorKey].id,
              target: artworkNode.id,
              label: "created"
            });
          });

          // Create or reuse a TimePeriod node for each unique time period.
          if (!globalTimePeriods.has(timePeriod)) {
            const timeNode = {
              id: `time-${timePeriod.replace(/\s+/g, "")}`,
              label: timePeriod,
              type: "TimePeriod"
            };
            globalTimePeriods.set(timePeriod, timeNode);
            nodes.push(timeNode);
          }
          // Link Artwork -> Global TimePeriod
          links.push({
            source: globalTimePeriods.get(timePeriod).id,
            target: artworkNode.id,
            label: "created in"
          });

          // If artwork has multiple artists, add collaboration links.
          if (creatorLabels.length > 1) {
            for (let i = 0; i < creatorLabels.length; i++) {
              for (let j = i + 1; j < creatorLabels.length; j++) {
                const key1 = creatorLabels[i].trim().toLowerCase();
                const key2 = creatorLabels[j].trim().toLowerCase();
                // Only add if not already present.
                if (!links.some(l =>
                  ((l.source === creatorsMap[key1].id && l.target === creatorsMap[key2].id) ||
                   (l.source === creatorsMap[key2].id && l.target === creatorsMap[key1].id))
                   && l.label === "collaborated with"
                )) {
                  links.push({
                    source: creatorsMap[key1].id,
                    target: creatorsMap[key2].id,
                    label: "collaborated with",
                    collaborative: true
                  });
                }
              }
            }
          }
        }
      });

      // Link each Creator node to the Provider.
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
      if (institutionSelect) {
        institutionSelect.innerHTML = "";
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All";
        institutionSelect.appendChild(allOption);

        globalTimePeriods.forEach(timeNode => {
          const option = document.createElement("option");
          option.value = timeNode.label;
          option.textContent = timeNode.label;
          institutionSelect.appendChild(option);
        });
      }

      // Create SVG patterns for Artwork nodes.
      const defs = container.append("defs");
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

      // Set up the force simulation with a column-based X force.
      let simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
          .id(d => d.id)
          .distance(link => {
            // Tweak distances to spread out the columns.
            if (link.label === "affiliated with") return 250; 
            if (link.label === "created in")    return 75;  
            if (link.label === "created")       return 100; 
            if (link.collaborative)             return 80;  
            return 150;
          })
        )
        .force("charge", d3.forceManyBody().strength(-30))
        // Force each type of node into a specific column on the X axis:
        .force("forceX", d3.forceX(d => {
          switch (d.type) {
            case "Provider":
              return 100;   // far left
            case "Creator":
              return 300;   // next column
            case "Artwork":
              return 550;   // center-ish
            case "TimePeriod":
              return 800;   // far right
            default:
              return 550;
          }
        }).strength(0.2))
        // Slight vertical centering:
        .force("forceY", d3.forceY(height / 2).strength(0.1))
        .force("collide", d3.forceCollide().radius(d => {
          if (d.type === "Provider") return 30;
          if (d.type === "Creator")  return 20;
          if (d.type === "TimePeriod") return 25;
          return 15; // Artwork
        }).iterations(2));

      // Draw links and nodes inside the zoomable container.
      const linkGroup = container.append("g").attr("class", "links");
      const nodeGroup = container.append("g").attr("class", "nodes");

      let linkSel = linkGroup.selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => d.collaborative ? "red" : "#aaa")
        .attr("stroke-opacity", 0.8)
        .attr("stroke-width", 2)
        // Make "created in" lines dotted:
        .attr("stroke-dasharray", d => d.label === "created in" ? "5,5" : null);

      let nodeSel = nodeGroup.selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", d => {
          if (d.type === "Provider")   return 20;
          if (d.type === "Creator")    return 10;
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
          if (d.type === "Artwork")    return "steelblue";
          if (d.type === "Provider")   return "gold";
          if (d.type === "Creator")    return "darkgreen";
          if (d.type === "TimePeriod") return "cornflowerblue";
          return "#fff";
        })
        .attr("stroke-width", 2)
        .call(d3.drag()
          .on("start", dragStarted)
          .on("drag", dragged)
          .on("end", dragEnded));

      // Tooltip and node enlargement.
      nodeSel.on("mouseover", (event, d) => {
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("r", () => {
            if (d.type === "Provider")   return 20 * 1.5;
            if (d.type === "Creator")    return 10 * 1.5;
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
          .attr("r", () => {
            if (d.type === "Provider")   return 20;
            if (d.type === "Creator")    return 10;
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
      // FILTERING: Reset and redraw graph based on selected time period.
      // -------------------------------
      document.getElementById("applyFilters").addEventListener("click", () => {
        console.log("Apply Filters button clicked");
        const selectedTime = document.getElementById("institution").value;
        console.log("Selected time period:", selectedTime);

        const filteredNodes = [];
        const filteredLinks = [];
        const filteredNodeIds = new Set();

        // Always include  Provider node.
        if (providerNode) {
          filteredNodes.push(providerNode);
          filteredNodeIds.add(providerNode.id);
        }

        // Filter for the global TimePeriod node(s).
        let filteredTimeNodes = [];
        if (selectedTime !== "all") {
          filteredTimeNodes = nodes.filter(n => n.type === "TimePeriod" && n.label === selectedTime);
        } else {
          filteredTimeNodes = nodes.filter(n => n.type === "TimePeriod");
        }
        filteredTimeNodes.forEach(timeNode => {
          filteredNodes.push(timeNode);
          filteredNodeIds.add(timeNode.id);
        });

        // Filter Artwork nodes: include only those whose timePeriod matches
        const filteredArtworks = nodes.filter(n =>
          n.type === "Artwork" && (selectedTime === "all" || n.timePeriod === selectedTime)
        );
        filteredArtworks.forEach(artwork => {
          filteredNodes.push(artwork);
          filteredNodeIds.add(artwork.id);
        });

        // Include Creator nodes that are linked to any filtered Artwork
        links.forEach(l => {
          if (l.label === "created") {
            const targetId = typeof l.target === "object" ? l.target.id : l.target;
            if (filteredNodeIds.has(targetId)) {
              const sourceId = typeof l.source === "object" ? l.source.id : l.source;
              if (!filteredNodeIds.has(sourceId)) {
                const creatorNode = nodes.find(n => n.id === sourceId);
                if (creatorNode) {
                  filteredNodes.push(creatorNode);
                  filteredNodeIds.add(creatorNode.id);
                }
              }
            }
          }
        });

        // Rebuild links: only include links whose both endpoints are in filteredNodes
        links.forEach(l => {
          const sourceId = typeof l.source === "object" ? l.source.id : l.source;
          const targetId = typeof l.target === "object" ? l.target.id : l.target;
          if (filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId)) {
            filteredLinks.push(l);
          }
        });

        console.log("Filtered nodes:", filteredNodes);
        console.log("Filtered links:", filteredLinks);

        // Clear current container content
        container.selectAll("*").remove();

        // Recreate artwork patterns.
        const newDefs = container.append("defs");
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

        // Create new groups for links and nodes.
        const newLinkGroup = container.append("g").attr("class", "links");
        const newNodeGroup = container.append("g").attr("class", "nodes");

        // Recreate the simulation with filtered data.
        simulation = d3.forceSimulation(filteredNodes)
          .force("link", d3.forceLink(filteredLinks)
            .id(d => d.id)
            .distance(link => {
              if (link.label === "affiliated with") return 180;
              if (link.label === "created in")    return 60;
              if (link.label === "created")       return 80;
              if (link.collaborative)             return 80;
              return 100;
            })
          )
          .force("charge", d3.forceManyBody().strength(-20))
          .force("forceX", d3.forceX(d => {
            switch (d.type) {
              case "Provider":
                return 100;
              case "Creator":
                return 300;
              case "Artwork":
                return 550;
              case "TimePeriod":
                return 800;
              default:
                return 550;
            }
          }).strength(0.2))
          .force("forceY", d3.forceY(height / 2).strength(0.1))
          .force("collide", d3.forceCollide().radius(20).iterations(1));

        const newLinkSel = newLinkGroup.selectAll("line")
          .data(filteredLinks)
          .join("line")
          .attr("stroke", d => d.collaborative ? "red" : "#aaa")
          .attr("stroke-opacity", 0.8)
          .attr("stroke-width", 2)
          // Make "created in" lines dotted:
          .attr("stroke-dasharray", d => d.label === "created in" ? "5,5" : null);

        const newNodeSel = newNodeGroup.selectAll("circle")
          .data(filteredNodes)
          .join("circle")
          .attr("r", d => {
            if (d.type === "Provider")   return 20;
            if (d.type === "Creator")    return 10;
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
            if (d.type === "Artwork")    return "steelblue";
            if (d.type === "Provider")   return "gold";
            if (d.type === "Creator")    return "darkgreen";
            if (d.type === "TimePeriod") return "cornflowerblue";
            return "#fff";
          })
          .attr("stroke-width", 2)
          .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded));

        newNodeSel.on("mouseover", (event, d) => {
          d3.select(event.currentTarget)
            .transition()
            .duration(200)
            .attr("r", () => {
              if (d.type === "Provider")   return 20 * 1.5;
              if (d.type === "Creator")    return 10 * 1.5;
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
            .attr("r", () => {
              if (d.type === "Provider")   return 20;
              if (d.type === "Creator")    return 10;
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
});
