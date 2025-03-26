document.addEventListener("DOMContentLoaded", () => {
  const API_KEY = "teradowls";
  const ARTIST_QUERY = "Johannes Vermeer";  // The artist to query
  // other artist can be Rijn Van Rembrandt
  //however Johannes Vermeer shows collaborators thus better for testing
  const PROVIDER = "Rijksmuseum";           // Using Rijksmuseum as DATA_PROVIDER
  const API_URL = `https://api.europeana.eu/record/v2/search.json?wskey=${API_KEY}&query=who:(${encodeURIComponent(ARTIST_QUERY)})&qf=DATA_PROVIDER:(%22${encodeURIComponent(PROVIDER)}%22)&profile=rich&media=true&rows=50&sort=score+desc`;

  // Helpers
  function getTitle(item) { //extracting title of artwork
    if (item.title?.length > 0) return item.title[0];
    if (item.dcTitleLangAware?.def?.length > 0) {
      return item.dcTitleLangAware.def[0];
    }
    return "Untitled";
  }

  function getCreatorLabels(item) { //get name of creators of artwork
    if (item.edmAgentLabel?.length > 0) {
      const labels = item.edmAgentLabel
        .map(agent => agent.def)
        .filter(name => name && name.trim() !== "");
      if (labels.length > 0) return labels;
    }
    if (item.dcCreator?.length > 0) {
      return item.dcCreator;
    }
    return ["Unknown Artist"]; //fallback
  }

  function getTimePeriod(item) { //get time period
    if (item.edmTimespanLabel?.length > 0) {
      return item.edmTimespanLabel[0].def || "Unknown Period";
    }
    return "Unknown Period";
  }



  function getMediaType(item) {
    // If English array with content return the first element
    if (item.dcTypeLangAware?.en?.length > 0) {
      return item.dcTypeLangAware.en[0]; // e.g. "painting"
    }
    //fall back to "def"
    if (item.dcTypeLangAware?.def?.length > 0) {
      return item.dcTypeLangAware.def[0]; // URL/ long text unfortunately
    }
    //  If no info, default to "Artwork"
    return "Artwork";
  }









  // Fetch Data from api
  fetch(API_URL)
    .then(response => response.json()) //convert response to json
    .then(data => {
      const width = 900; //setting up dimensions 
      const height = 700;

      // Create main SVG and zoomable container.
      const svg = d3.select("#graph")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const container = svg.append("g"); // group element that holds everything is svg

      svg.call(d3.zoom()
        .scaleExtent([0.1, 10]) //setting limits of the zooming
        .on("zoom", event => {
          container.attr("transform", event.transform); //applying zoom transforms
        })
      );




      // Tooltip display info when hovering
      const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background-color", "white")
        .style("border", "1px solid #ccc")
        .style("padding", "5px")
        .style("font-size", "12px")
        .style("pointer-events", "none"); // prevent tooltip interfering with interactions


      //extracting artwork items from api
      const items = data.items || [];
      const nodes = [];
      const links = []; // list of links
      const creatorsMap = {}; // map to store creators and prevent duplicates

      // map to store artworks cateogorised by time period
      const timePeriodMap = new Map();

      // Provider node
      let providerNode = null;
      if (items.length > 0 && items[0].dataProvider?.length > 0) {
        providerNode = {
          id: `provider-${items[0].dataProvider[0]}`,
          label: items[0].dataProvider[0],
          type: "Provider"
        };
        nodes.push(providerNode);
      }

      // --- Build Artwork and Creator nodes ---
      items.forEach(item => {
        if (item.edmIsShownBy?.length > 0) {
          const title = getTitle(item);
          const timePeriod = getTimePeriod(item);
          const mediaType = getMediaType(item);

          //creating artwork node
          const artworkNode = {
            id: item.id,
            label: title,
            type: "Artwork",
            medium: getMediaType(item),
            image: item.edmIsShownBy[0],
            timePeriod
          };
          nodes.push(artworkNode);

          //grouping bounding box by time period
          if (!timePeriodMap.has(timePeriod)) {
            timePeriodMap.set(timePeriod, []);
          }
          timePeriodMap.get(timePeriod).push(artworkNode);

          // handling crfeators and linking them to artworks
          const creatorLabels = getCreatorLabels(item);
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
            links.push({
              source: creatorsMap[creatorKey].id,
              target: artworkNode.id,
              label: "created"
            });
          });

          // Collaboration links if multiple creators
          if (creatorLabels.length > 1) {
            for (let i = 0; i < creatorLabels.length; i++) {
              for (let j = i + 1; j < creatorLabels.length; j++) {
                const key1 = creatorLabels[i].trim().toLowerCase();
                const key2 = creatorLabels[j].trim().toLowerCase();
                // Only add if not already present
                if (!links.some(l =>
                  ((l.source === creatorsMap[key1].id && l.target === creatorsMap[key2].id) ||
                    (l.source === creatorsMap[key2].id && l.target === creatorsMap[key1].id)) &&
                  l.label === "collaborated with"
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

      // Link each Creator to the Provider
      Object.keys(creatorsMap).forEach(key => {
        if (providerNode) {
          links.push({
            source: creatorsMap[key].id,
            target: providerNode.id,
            label: "affiliated with"
          });
        }
      });

      // Log for debugging
      console.log("Nodes:", nodes);
      console.log("Links:", links);

      // Populate time period dropdown
      const institutionSelect = document.getElementById("institution");
      if (institutionSelect) {
        institutionSelect.innerHTML = "";
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All";
        institutionSelect.appendChild(allOption);

        // Insert each time period
        for (const [period] of timePeriodMap) {
          const option = document.createElement("option");
          option.value = period;
          option.textContent = period;
          institutionSelect.appendChild(option);
        }
      }

      // Artwork patterns
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

      //  group to hold  bounding boxes and labels behind everything
      const timePeriodBackgroundGroup = container.insert("g", ":first-child").attr("class", "timePeriodBackgrounds");
      //store objects { rect, label, period } update  each tick
      const boundingBoxes = [];

      for (const [period] of timePeriodMap) {
        const g = timePeriodBackgroundGroup.append("g").attr("class", "timePeriodBox");
        const rect = g.append("rect")
          .attr("fill", "rgba(200,200,255,0.15)")
          .attr("stroke", "rgba(120,120,255,0.5)")
          .attr("stroke-width", 1);
        const label = g.append("text")
          .attr("fill", "blue")
          .attr("font-size", 14)
          .attr("font-weight", "bold")
          .text(period);

        boundingBoxes.push({ period, rect, label });
      }

      // Force simulation with columns
      let simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
          .id(d => d.id)
          .distance(link => {
            if (link.label === "affiliated with") return 250;
            if (link.label === "created") return 100;
            if (link.collaborative) return 80;
            return 150;
          })
        )
        .force("charge", d3.forceManyBody().strength(-30))
        .force("forceX", d3.forceX(d => {
          switch (d.type) {
            case "Provider": return 100;
            case "Creator": return 300;
            case "Artwork": return 550;
            default: return 550;
          }
        }).strength(0.2))
        .force("forceY", d3.forceY(height / 2).strength(0.1))
        .force("collide", d3.forceCollide().radius(d => {
          if (d.type === "Provider") return 30;
          if (d.type === "Creator") return 20;
          return 15; // Artwork
        }).iterations(2))

      // Link & node groups
      const linkGroup = container.append("g").attr("class", "links");
      const nodeGroup = container.append("g").attr("class", "nodes");

      let linkSel = linkGroup.selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => d.collaborative ? "red" : "#aaa")
        .attr("stroke-opacity", 0.8)
        .attr("stroke-width", 2);

      let nodeSel = nodeGroup.selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", d => {
          if (d.type === "Provider") return 20;
          if (d.type === "Creator") return 10;
          return 12;
        })
        .attr("fill", d => {
          if (d.type === "Artwork" && d.image) {
            return `url(#pattern-${d.id})`;
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
          .on("end", dragEnded)
        );

      // Tooltip
      nodeSel.on("mouseover", (event, d) => {
        d3.select(event.currentTarget)
          .transition()
          .duration(200)
          .attr("r", () => {
            if (d.type === "Provider") return 20 * 1.5;
            if (d.type === "Creator") return 10 * 1.5;
            return 12 * 1.5;
          });
        let tooltipContent = `<strong>${d.label}</strong><br>
          Type: ${d.type} <br>
          Medium: ${d.medium}`;
        if (d.type === "Artwork" && d.image) {
          tooltipContent = `<img src="${d.image}" width="150" height="150" style="display:block;margin-bottom:5px;">` + tooltipContent;
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
            if (d.type === "Provider") return 20;
            if (d.type === "Creator") return 10;
            return 12;
          });
        tooltip.transition().duration(200).style("opacity", 0);
      });

      // On each tick, update node positions and bounding boxes
      simulation.on("tick", () => {
        linkSel
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        nodeSel
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);

        // Update bounding boxes for each time period
        boundingBoxes.forEach(({ period, rect, label }) => {
          const artworks = timePeriodMap.get(period) || [];
          if (!artworks.length) return;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          artworks.forEach(artNode => {
            // find the actual node in 'nodes'
            const node = nodes.find(n => n.id === artNode.id);
            if (node) {
              if (node.x < minX) minX = node.x;
              if (node.x > maxX) maxX = node.x;
              if (node.y < minY) minY = node.y;
              if (node.y > maxY) maxY = node.y;
            }
          });

          if (minX === Infinity) return; // no valid positions

          // Add padding
          const pad = 20;
          minX -= pad; minY -= pad;
          maxX += pad; maxY += pad;




          rect
            .attr("x", minX)
            .attr("y", minY)
            .attr("width", maxX - minX)
            .attr("height", maxY - minY);

          label
            .attr("x", minX + 5)
            .attr("y", minY + 15);
        });
      });

      // Filter: Time Period only
      document.getElementById("applyFilters").addEventListener("click", () => {
        const selectedTime = institutionSelect.value;
        console.log("Selected time for filter:", selectedTime);

        const filteredNodes = [];
        const filteredLinks = [];
        const filteredNodeIds = new Set();

        // Always keep provider
        if (providerNode) {
          filteredNodes.push(providerNode);
          filteredNodeIds.add(providerNode.id);
        }

        // Artwork filter
        const filteredArtworks = (selectedTime === "all")
          ? nodes.filter(n => n.type === "Artwork")
          : nodes.filter(n => n.type === "Artwork" && n.timePeriod === selectedTime);

        filteredArtworks.forEach(a => {
          filteredNodes.push(a);
          filteredNodeIds.add(a.id);
        });

        // Include creators of these artworks
        links.forEach(l => {
          if (l.label === "created") {
            const tId = (typeof l.target === "object") ? l.target.id : l.target;
            if (filteredNodeIds.has(tId)) {
              const sId = (typeof l.source === "object") ? l.source.id : l.source;
              if (!filteredNodeIds.has(sId)) {
                const cNode = nodes.find(n => n.id === sId);
                if (cNode) {
                  filteredNodes.push(cNode);
                  filteredNodeIds.add(cNode.id);
                }
              }
            }
          }
        });

        // Rebuild links
        links.forEach(l => {
          const sId = (typeof l.source === "object") ? l.source.id : l.source;
          const tId = (typeof l.target === "object") ? l.target.id : l.target;
          if (filteredNodeIds.has(sId) && filteredNodeIds.has(tId)) {
            filteredLinks.push(l);
          }
        });

        // Clear
        container.selectAll("*").remove();

        // Recreate Artwork patterns
        const newDefs = container.append("defs");
        filteredNodes.forEach(d => {
          if (d.type === "Artwork" && d.image) {
            newDefs.append("pattern")
              .attr("id", `pattern-${d.id}`)
              .attr("width", 1)
              .attr("height", 1)
              .append("image")
              .attr("xlink:href", d.image)
              .attr("width", 20)
              .attr("height", 20)
              .attr("preserveAspectRatio", "xMidYMid slice");
          }
        });

        // Build new timePeriodMap for bounding boxes in the filtered set
        const newTimePeriodMap = new Map();
        filteredNodes.forEach(n => {
          if (n.type === "Artwork") {
            if (!newTimePeriodMap.has(n.timePeriod)) {
              newTimePeriodMap.set(n.timePeriod, []);
            }
            newTimePeriodMap.get(n.timePeriod).push(n);
          }
        });


                // Build an array of the time periods
                // Gather time periods
        const periodList = Array.from(timePeriodMap.keys());

        // Sort them by numeric year 
        function parseNumericYear(periodLabel) {
          const match = periodLabel.match(/\d{3,4}/);
          if (match) return +match[0];
          return 0; // fallback
        }
        periodList.sort((a, b) => parseNumericYear(a) - parseNumericYear(b));

            //Define angle scale
        const angleScale = d3.scaleBand()
        .domain(periodList)         // the sorted list of time periods
        .range([0, 2 * Math.PI])    // full circle
        .padding(0.1);              // optional spacing

        // For radius, spread  from 100..500 in increasing steps:
        const radiusScale = d3.scaleLinear()
        .domain([0, periodList.length - 1])
        .range([100, 500]);

        // Create bounding boxes for the filtered set
        const newTimePeriodBackgroundGroup = container.insert("g", ":first-child").attr("class", "timePeriodBackgrounds");
        const newBoundingBoxes = [];

        for (const [period] of newTimePeriodMap) {
          const g = newTimePeriodBackgroundGroup.append("g").attr("class", "timePeriodBox");
          const rect = g.append("rect")
            .attr("fill", "rgba(200,200,255,0.15)")
            .attr("stroke", "rgba(120,120,255,0.5)")
            .attr("stroke-width", 1);
          const label = g.append("text")
            .attr("fill", "blue")
            .attr("font-size", 14)
            .attr("font-weight", "bold")
            .text(period);
          newBoundingBoxes.push({ period, rect, label });
        }

        // Link & Node groups
        const newLinkGroup = container.append("g").attr("class", "links");
        const newNodeGroup = container.append("g").attr("class", "nodes");

        // Force simulation again
        simulation = d3.forceSimulation(filteredNodes)
          .force("link", d3.forceLink(filteredLinks)
            .id(d => d.id)
            .distance(link => {
              if (link.label === "affiliated with") return 250;
              if (link.label === "created") return 200;
              if (link.collaborative) return 80;
              return 150;
            })
          )
          .force("charge", d3.forceManyBody().strength(-30))
          .force("collide", d3.forceCollide().radius(d => {
            // up to you
            if (d.type === "Creator") return 20;
            return 15;
          }).iterations(2))  
          //  position Artwork by angle, radius
          .force("x", d3.forceX(d => {
            if (d.type === "Artwork") {
              const i = periodList.indexOf(d.timePeriod); 
              if (i === -1) {
                // if it's unknown or not in the list
                return width / 2; 
              }
              // Get angle and radius
              const angle = angleScale(d.timePeriod);
              const r = radiusScale(i);
              return (width / 2) + r * Math.cos(angle);
            }
            // Creator/Provider => center
            return width / 2;
          }).strength(1))
          .force("y", d3.forceY(d => {
            if (d.type === "Artwork") {
              const i = periodList.indexOf(d.timePeriod);
              if (i === -1) {
                return height / 2;
              }
              const angle = angleScale(d.timePeriod);
              const r = radiusScale(i);
              return (height / 2) + r * Math.sin(angle);
            }
            // Creator/Provider => center
            return height / 2;
          }).strength(1));
          
        const newLinkSel = newLinkGroup.selectAll("line")
          .data(filteredLinks)
          .join("line")
          .attr("stroke", d => d.collaborative ? "red" : "#aaa")
          .attr("stroke-opacity", 0.8)
          .attr("stroke-width", 2);

        const newNodeSel = newNodeGroup.selectAll("circle")
          .data(filteredNodes)
          .join("circle")
          .attr("r", d => {
            if (d.type === "Provider") return 20;
            if (d.type === "Creator") return 10;
            return 12;
          })
          .attr("fill", d => {
            if (d.type === "Artwork" && d.image) {
              return `url(#pattern-${d.id})`;
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
            .on("end", dragEnded)
          );

        newNodeSel.on("mouseover", (event, d) => {
          d3.select(event.currentTarget)
            .transition()
            .duration(200)
            .attr("r", () => {
              if (d.type === "Provider") return 20 * 1.5;
              if (d.type === "Creator") return 10 * 1.5;
              return 12 * 1.5;
            });
          let tooltipContent = `<strong>${d.label}</strong><br>Type: ${d.type} <br>Medium: ${d.medium}`;
          if (d.type === "Artwork" && d.image) {
            tooltipContent = `<img src="${d.image}" width="150" height="150" style="display:block;margin-bottom:5px;">` + tooltipContent;
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
              if (d.type === "Provider") return 20;
              if (d.type === "Creator") return 10;
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

          // Update bounding boxes
          newBoundingBoxes.forEach(({ period, rect, label }) => {
            const periodArtworks = newTimePeriodMap.get(period) || [];
            if (!periodArtworks.length) return;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            periodArtworks.forEach(art => {
              const node = filteredNodes.find(n => n.id === art.id);
              if (node) {
                if (node.x < minX) minX = node.x;
                if (node.x > maxX) maxX = node.x;
                if (node.y < minY) minY = node.y;
                if (node.y > maxY) maxY = node.y;
              }
            });
            if (minX === Infinity) return;
            const pad = 20;
            minX -= pad; minY -= pad;
            maxX += pad; maxY += pad;

            rect
              .attr("x", minX)
              .attr("y", minY)
              .attr("width", maxX - minX)
              .attr("height", maxY - minY);
            label
              .attr("x", minX + 5)
              .attr("y", minY + 15);
          });
        });

        simulation.alpha(1).restart();
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

      // Draw Timeline Background with Grouping ---
      //  create a separate timeline SVG that groups artworks by time period.
      const timelineWidth = 900;
      const timelineHeight = 150;
      const timelineMargin = { top: 20, right: 20, bottom: 20, left: 40 };

      // Create an SVG for the timeline in the element with id "timeline".
      const timelineSvg = d3.select("#timeline")
        .append("svg")
        .attr("width", timelineWidth)
        .attr("height", timelineHeight);

      // Helper to extract a numeric year from a period label using a regex.
      function parseYear(label) {
        const match = label.match(/\d{3,4}/);
        if (match) return +match[0];
        return 0;
      }

      // Build timeline data from the unique time periods.
      const timelineData = Array.from(timePeriodMap.entries())
        .filter(([_, artworks]) => artworks.length > 0)
        .map(([period, artworks]) => ({
          label: period,
          year: parseYear(period)
        }))
        .filter(d => d.year > 0); // remove "Unknown" for the timeline 

      const timelineDataRaw = Array.from(timePeriodMap.entries())
        .filter(([_, artworks]) => artworks.length > 0)
        .map(([period, artworks]) => ({
          label: period,
          year: parseYear(period)
        }));

      const knownTimelineData = timelineDataRaw.filter(d => d.year > 0);
      const unknownTimelineData = timelineDataRaw.filter(d => d.year === 0); // "Unknown"


      const unknownX = timelineMargin.left - 40; // to the left of the timeline

      // Circle
      timelineSvg.selectAll(".unknownCircle")
        .data(unknownTimelineData)
        .join("circle")
        .attr("class", "unknownCircle")
        .attr("cx", unknownX)
        .attr("cy", timelineHeight / 2)
        .attr("r", 8)
        .attr("fill", "#007acc")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);

      // Label
      timelineSvg.selectAll(".unknownLabel")
        .data(unknownTimelineData)
        .join("text")
        .attr("class", "unknownLabel")
        .attr("x", unknownX)
        .attr("y", (timelineHeight / 2) - 16)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .attr("font-size", 12)
        .text("Unknown");




      // Create a linear scale to map numeric years to positions on the timeline.
      const xExtent = d3.extent(timelineData, d => d.year);
      const xScale = d3.scaleLinear()
        .domain([xExtent[0] || 0, xExtent[1] || 100])
        .range([timelineMargin.left, timelineWidth - timelineMargin.right]);

      // Create an axis for the timeline.
      const xAxis = d3.axisBottom(xScale)
        .tickFormat(d => (d === 0 ? "Unknown" : d));
      timelineSvg.append("g")
        .attr("transform", `translate(0,${timelineHeight - timelineMargin.bottom})`)
        .call(xAxis);

      // --- Add Time Period Markers ---
      // Plot a circle for each unique time period.
      timelineSvg.selectAll(".timelineCircle")
        .data(timelineData)
        .join("circle")
        .attr("class", "timelineCircle")
        .attr("cx", d => xScale(d.year))
        .attr("cy", timelineHeight / 2)
        .attr("r", 8)
        .attr("fill", "#007acc")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .on("mouseover", function (event, d) {
          d3.select(this).attr("r", 12);
          tooltip.transition().duration(200).style("opacity", 1);
          tooltip.html(`<strong>${d.label}</strong><br>Year: ${d.year || "Unknown"}`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function (event, d) {
          d3.select(this).attr("r", 8);
          tooltip.transition().duration(200).style("opacity", 0);
        })
        .on("click", function (event, d) {
          // Clicking a time period marker sets the dropdown value and triggers the filter.
          document.getElementById("institution").value = d.label;
          document.getElementById("applyFilters").click();
        });

      //  text labels above each timeline marker.
      timelineSvg.selectAll(".timelineLabel")
        .data(timelineData)
        .join("text")
        .attr("class", "timelineLabel")
        .attr("x", d => xScale(d.year))
        .attr("y", (timelineHeight / 2) - 16)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .attr("font-size", 12)
        .text(d => d.label);

      // --- Add Artwork Markers to the Timeline ---
      // For each artwork - a marker on the timeline. markers are positioned by the time period’s numeric year.
      // If multiple artworks share same period vertically stack them with a slight offset
      const artworkTimelineData = [];
      for (const [period, artworks] of timePeriodMap) {
        const year = parseYear(period);
        artworks.forEach((artwork, index) => {
          artworkTimelineData.push({
            period,
            year,
            artwork,
            index,
            total: artworks.length
          });
        });
      }

      // For each artwork in timeline plot small circle 
      timelineSvg.selectAll(".artworkTimelineMarker")
        .data(artworkTimelineData)
        .join("circle")
        .attr("class", "artworkTimelineMarker")
        // Horizontal position based on the year plus a slight jitter 
        .attr("cx", d => xScale(d.year) + (d.index % 3) * 4)
        // Vertical position: slightly below the axis + additional offset per artwork.
        .attr("cy", d => (timelineHeight / 2) + 20 + (Math.floor(d.index / 3) * 8))
        .attr("r", 4)
        .attr("fill", "orange")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1)
        .on("mouseover", function (event, d) {
          d3.select(this).attr("r", 6);
          tooltip.transition().duration(200).style("opacity", 1);
          tooltip.html(`<strong>${d.artwork.label}</strong><br>Period: ${d.period}`)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function (event, d) {
          d3.select(this).attr("r", 4);
          tooltip.transition().duration(200).style("opacity", 0);
        })
        .on("click", function (event, d) {
          // TO ADD: Clicking an artwork marker could  highlight the artwork in the network graph.
          console.log("Artwork clicked:", d.artwork.label);
        });

      timelineSvg.selectAll(".unknownArtworkMarker")
        .data(artworkTimelineData.filter(d => d.year === 0))
        .join("circle")
        .attr("class", "unknownArtworkMarker")
        .attr("cx", d => unknownX + (d.index % 3) * 4)
        .attr("cy", d => (timelineHeight / 2) + 20 + (Math.floor(d.index / 3) * 8))
        .attr("r", 4)
        .attr("fill", "orange")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);










      // LEAFLET MAP INTEGRATION 

      // Global variable to access markers in the filter too
      let mapPoints = [];

      // Build mapPoints array from items with coordinates
      items.forEach(item => {
        const lat = item.edmPlaceLatitude?.[0];
        const lon = item.edmPlaceLongitude?.[0];
        if (lat && lon) {
          mapPoints.push({

            lat: parseFloat(lat),
            lon: parseFloat(lon),
            title: getTitle(item),
            creators: getCreatorLabels(item),
            image: item.edmIsShownBy?.[0],
            timePeriod: getTimePeriod(item)
          });

        }
      });

      // Create map
      const map = L.map("map").setView([52.37, 4.89], 5); // Default to Amsterdam - change later to default based on centre of most artworks retreived from query
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      // Marker layer group
      const markerLayer = L.layerGroup().addTo(map);

      // Helper to add markers
      function updateMapMarkers(points) {
        markerLayer.clearLayers();
        points.forEach(p => {
          const popupContent = `
      <div style="max-width:200px">
        ${p.image ? `<img src="${p.image}" style="width:100%; margin-bottom: 5px;">` : ""}
        <strong>${p.title}</strong><br>
        <em>${p.creators.join(", ")}</em>
      </div>
    `;
          L.marker([p.lat, p.lon]).addTo(markerLayer).bindPopup(popupContent);
        });

        if (points.length > 0) {
          const bounds = points.map(p => [p.lat, p.lon]);
          map.fitBounds(bounds, { padding: [20, 20] });
        }
      }

      // Initial display
      updateMapMarkers(mapPoints);

      // Hook into existing time period filter
      document.getElementById("applyFilters").addEventListener("click", () => {
        const selectedTime = document.getElementById("institution").value;
        const filteredPoints = (selectedTime === "all")
          ? mapPoints
          : mapPoints.filter(p => p.timePeriod === selectedTime);
        updateMapMarkers(filteredPoints);
      });











      //error 




    })
    .catch(error => console.error("Error fetching data:", error));
});
