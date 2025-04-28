document.addEventListener("DOMContentLoaded", () => {
  /***********************************************
        API KEYS, PROVIDER, AND FACET SETUP
   ***********************************************/
  const API_KEY = "teradowls";
  const PROVIDER = "Rijksmuseum";
  const API_URL = `https://api.europeana.eu/record/v2/search.json?query=*&wskey=${API_KEY}&qf=DATA_PROVIDER:(%22${encodeURIComponent(PROVIDER)}%22)&profile=rich&media=true&rows=50&sort=score+desc`;
  const FACET_URL = `https://api.europeana.eu/record/v2/search.json?query=*&wskey=${API_KEY}&qf=DATA_PROVIDER:(%22${encodeURIComponent(PROVIDER)}%22)&profile=facets&facet=who&rows=0&f.who.facet.limit=100000`;

  // Populate artist dropdown
  fetch(FACET_URL)
    .then(r => r.json())
    .then(data => {
      const facet = data.facets?.find(f => f.name === "who");
      if (!facet) return;

      // Grab the <select> up front
      const sel = document.getElementById("artist");

      // Populate options
      sel.innerHTML = `<option value="all">All Artists</option>`;
      facet.fields.forEach(f => {
        const o = document.createElement("option");
        o.value = f.label;
        o.textContent = f.label;
        sel.appendChild(o);
      });

      //  Listen for changes
      sel.addEventListener("change", () => {
        updateColorFacetsFor(sel.value);
      });

      // Fetch the initial colour facets
      updateColorFacetsFor(sel.value);
    })
    .catch(console.error);


  /***********************************************
   * COLOUR FACET SETUP
   ***********************************************/
  function updateColorFacetsFor(artist) {
    const whoQuery = artist === "all"
      ? "*"
      : `who:(${encodeURIComponent(artist)})`;

    const url = [
      "https://api.europeana.eu/record/v2/search.json",
      `?wskey=${API_KEY}`,
      `&query=${whoQuery}`,
      `&qf=DATA_PROVIDER:("${encodeURIComponent(PROVIDER)}")`,
      "&profile=facets",
      "&media=true",
      "&rows=0",
      "&facet=COLOURPALETTE"
    ].join("");

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const facet = data.facets?.find(f => f.name === "COLOURPALETTE");
        if (!facet) return;

        // extract and sort the hexes
        const hexes = facet.fields.map(f => f.label);
        const sorted = sortColors(hexes);

        // clear the container
        const container = document.getElementById("color-options");
        container.innerHTML = "";

        // create a checkbox for each colour
        sorted.forEach(color => {
          const chip = document.createElement("label");
          chip.className = "color-option";

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = color;

          const sw = document.createElement("div");
          sw.className = "swatch";
          sw.style.background = color;

          const hx = document.createElement("span");
          hx.className = "hex";
          hx.textContent = color;

          chip.append(cb, sw, hx);
          container.appendChild(chip);
        });
        // ─────────────────────────────────────────

      })
      .catch(console.error);
  }

  // Sort the hexes by hue, chroma, and lightness
  function sortColors(colors) {
    const hueVal = hex => {
      const h = d3.hcl(hex).h;
      return isNaN(h) ? Infinity : h;
    };
    return colors.slice().sort((a, b) => {
      const ha = hueVal(a), hb = hueVal(b);
      if (ha !== hb) return ha - hb;
      const ca = d3.hcl(a).c, cb = d3.hcl(b).c;
      if (ca !== cb) return cb - ca;
      const la = d3.hcl(a).l, lb = d3.hcl(b).l;
      return la - lb;
    });
  }





  /***********************************************
   * ARTIST FILTER HOOKS
   ***********************************************/
  document.getElementById("applyArtistFilter").onclick = () => {
    const a = document.getElementById("artist").value;
    const q = a === "all" ? "*" : `who:(${encodeURIComponent(a)})`;
    fetchAndRenderArtworks(
      `https://api.europeana.eu/record/v2/search.json?wskey=${API_KEY}&query=${q}&qf=DATA_PROVIDER:(%22${encodeURIComponent(
        PROVIDER
      )}%22)&profile=rich&media=true&rows=50&sort=score+desc`
    );
  };

  document.getElementById("applyColorFilter").onclick = () => {
    const selectedColors = Array.from(document.querySelectorAll('#color-options input[type=checkbox]:checked'))
      .map(cb => cb.value);

    if (selectedColors.length === 0) {
      alert("Please select at least one colour.");
      return;
    }

    const artist = document.getElementById("artist").value;
    const qArtist = artist === "all"
      ? "*"
      : `who:(${encodeURIComponent(artist)})`;

    const colorParams = selectedColors
      .map(c => `colourpalette=${encodeURIComponent(c)}`)
      .join("&");

    const apiUrl =
      `https://api.europeana.eu/record/v2/search.json` +
      `?wskey=${API_KEY}` +
      `&query=${qArtist}` +
      `&qf=DATA_PROVIDER:("${encodeURIComponent(PROVIDER)}")` +
      `&media=true&rows=50&` +
      colorParams;

    fetchAndRenderArtworks(apiUrl);
  };



  /***********************************************
   * MAIN RENDER FUNCTION
   ***********************************************/
  let rawNodes, rawLinks;
  let timePeriodMap = new Map();
  const clusterLoadState = {};   // for tracking cluster expansion
  /**
   * Gradually expand large cluster in batches to keep responsive
   */
  function expandClusterBatched(clusterNode, curNodes, curLinks, batchSize = 10, delay = 500) {
    const allArts = clusterNode.collapsedNodes.slice();
    let loaded = 0;

    function loadNext() {
      // Remove the cluster node and its links
      let nodesAcc = curNodes.filter(n => n.id !== clusterNode.id);
      let linksAcc = curLinks.filter(
        l => l.source !== clusterNode.id && l.target !== clusterNode.id
      );

      // Add every artwork up to the current loaded index
      const slice = allArts.slice(0, loaded + batchSize);
      slice.forEach(art => {
        nodesAcc.push(art);
        rawLinks
          .filter(l => l.label === "created" && l.target === art.id)
          .forEach(l => linksAcc.push({ ...l }));
      });

      // If there are more artworks remaining, re-insert exactly one placeholder
      if (loaded + batchSize < allArts.length) {
        nodesAcc.push(clusterNode);
        rawLinks
          .filter(l => l.target === clusterNode.id)
          .forEach(l => linksAcc.push({ ...l }));
      }

      // increase batch counter
      loaded += batchSize;

      // Recompute timePeriodMap and redraw
      timePeriodMap = new Map();
      nodesAcc
        .filter(n => n.type === "Artwork")
        .forEach(art => {
          (timePeriodMap.get(art.timePeriod) || timePeriodMap.set(art.timePeriod, [])).push(art);
        });
      drawTimeBoxes();
      updateGraph(nodesAcc, linksAcc);

      // if there are more artworks to load - set a timeout for the next batch
      if (loaded < allArts.length) {
        setTimeout(loadNext, delay);
      }
    }

    // start the next batch
    loadNext();
  }



  function fetchAndRenderArtworks(apiUrl) {
    // Clear previous graph
    d3.select("#graph").selectAll("*").remove();

    fetch(apiUrl)
      .then(r => r.json())
      .then(data => {
        const items = data.items || [];
        const width = 900,
          height = 700;

        // SVG + ZOOM 
        const svg = d3
          .select("#graph")
          .append("svg")
          .attr("width", width)
          .attr("height", height);

        //  group for zooming
        const container = svg.append("g");

        svg.call(
          d3
            .zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", e => container.attr("transform", e.transform))
        );


        let bbs = [], timeBG;
        function drawTimeBoxes() {
          // remove old boxes
          container.select("g.timePeriodBackgrounds").remove();
          bbs = [];
          // insert fresh background group behind everything
          timeBG = container.insert("g", ":first-child")
            .attr("class", "timePeriodBackgrounds");
          // for each period in map, append a <g> with rect+label
          timePeriodMap.forEach((arts, period) => {
            const g = timeBG.append("g").attr("class", "timePeriodBox");
            const rect = g.append("rect")
              .attr("fill", "rgba(200,200,255,0.15)")
              .attr("stroke", "rgba(120,120,255,0.5)")
              .attr("stroke-width", 1);
            const label = g.append("text")
              .attr("fill", "blue")
              .attr("font-size", 14)
              .attr("font-weight", "bold")
              .text(period);
            bbs.push({ period, rect, label });
          });
        }

        // ——— TOOLTIP ———
        const tooltip = d3
          .select("body")
          .append("div")
          .attr("class", "tooltip")
          .style("opacity", 0)
          .style("position", "absolute")
          .style("background", "white")
          .style("border", "1px solid #ccc")
          .style("padding", "5px")
          .style("font-size", "12px")
          .style("pointer-events", "none");

        // ——— GALLERY ———
        updateGallery(
          items
            .filter(i => i.edmIsShownBy?.length)
            .map(i => ({ label: getTitle(i), image: i.edmIsShownBy[0] }))
        );

        // ——— BUILD RAW NODES & LINKS ———
        let nodes = [],
          links = [];
        const creatorsMap = {};
        timePeriodMap = new Map();
        let providerNode = null;

        // Provider
        if (items[0]?.dataProvider?.length) {
          providerNode = {
            id: `provider-${items[0].dataProvider[0]}`,
            label: items[0].dataProvider[0],
            type: "Provider"
          };
          nodes.push(providerNode);
        }

        // Artworks & Creators
        items.forEach(item => {
          if (!item.edmIsShownBy?.length) return;
          const title = getTitle(item),
            tp = getTimePeriod(item),
            mt = getMediaType(item);

          // ARTWORK NODE
          const art = {
            id: item.id,
            label: title,
            type: "Artwork",
            medium: mt,
            image: item.edmIsShownBy[0],
            timePeriod: tp
          };
          nodes.push(art);
          (timePeriodMap.get(tp) || timePeriodMap.set(tp, []).get(tp)).push(art);

          // CREATORS + CREATED LINK
          getCreatorLabels(item).forEach(lbl => {
            const key = lbl.trim().toLowerCase();
            if (!creatorsMap[key]) {
              creatorsMap[key] = {
                id: `creator-${key}`,
                label: lbl,
                type: "Creator"
              };
              nodes.push(creatorsMap[key]);
            }
            links.push({
              source: creatorsMap[key].id,
              target: art.id,
              label: "created"
            });
          });

          // COLLABORATIONS links
          const cls = getCreatorLabels(item).map(l => l.trim().toLowerCase());
          if (cls.length > 1) {
            for (let i = 0; i < cls.length; i++) {
              for (let j = i + 1; j < cls.length; j++) {
                const a = creatorsMap[cls[i]].id,
                  b = creatorsMap[cls[j]].id;
                if (
                  !links.some(
                    l =>
                      l.label === "collaborated with" &&
                      ((l.source === a && l.target === b) ||
                        (l.source === b && l.target === a))
                  )
                ) {
                  links.push({
                    source: a,
                    target: b,
                    label: "collaborated with",
                    collaborative: true
                  });
                }
              }
            }
          }
        });

        // — Add provider links to creators
        Object.values(creatorsMap).forEach(c => {
          if (providerNode)
            links.push({
              source: c.id,
              target: providerNode.id,
              label: "affiliated with"
            });
        });
        rawNodes = nodes.slice();
        rawLinks = links.slice();
        drawTimeBoxes();


        // — Populate Time‑Period dropdown —
        const institutionSelect = document.getElementById("institution");
        if (institutionSelect) {
          institutionSelect.innerHTML = "";
          // “All” option
          const allOpt = document.createElement("option");
          allOpt.value = "all";
          allOpt.textContent = "All";
          institutionSelect.appendChild(allOpt);
          // one option per period
          Array.from(timePeriodMap.keys()).forEach(period => {
            const opt = document.createElement("option");
            opt.value = period;
            opt.textContent = period;
            institutionSelect.appendChild(opt);
          });
        } // — Filter the graph by time period —

        // Initialise Choices.js on the populated <select>
        new Choices(institutionSelect, {
          searchEnabled: false,
          shouldSort: false,
          itemSelectText: '',
        });

        document.getElementById("applyFilters").addEventListener("click", () => {
          const sel = institutionSelect.value;

          // filter nodes and links
          const keep = new Set();
          const filteredNodes = [];
          const filteredLinks = [];

          // always keep provider
          if (providerNode) {
            keep.add(providerNode.id);
            filteredNodes.push(providerNode);
          }

          // keep artworks in this period
          rawNodes.forEach(n => {
            if (n.type === "Artwork" && (sel === "all" || n.timePeriod === sel)) {
              keep.add(n.id);
              filteredNodes.push(n);
            }
          });
          updateGallery(
            filteredNodes
              .filter(n => n.type === "Artwork" && n.image)
              .map(n => ({ label: n.label, image: n.image }))
          );


          // keep creators of kept artworks
          rawLinks.forEach(l => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            if (l.label === "created" && keep.has(tgt)) {
              if (!keep.has(src)) {
                keep.add(src);
                filteredNodes.push(rawNodes.find(n => n.id === src));
              }
              filteredLinks.push({ source: src, target: tgt, label: "created" });
            }
          });

          // any other links between kept nodes
          rawLinks.forEach(l => {
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            if (keep.has(src) && keep.has(tgt) && l.label !== "created") {
              filteredLinks.push(Object.assign({}, l));
            }
          });

          //  rebuild artwork patterns
          container.select("defs").remove();
          const defs = container.append("defs");
          filteredNodes
            .filter(d => d.type === "Artwork" && d.image)
            .forEach(d => {
              defs.append("pattern")
                .attr("id", `pattern-${d.id}`)
                .attr("width", 1)
                .attr("height", 1)
                .append("image")
                .attr("xlink:href", d.image)
                .attr("width", 20)
                .attr("height", 20)
                .attr("preserveAspectRatio", "xMidYMid slice");
            });

          //  rebuild bounding‐box groups
          container.select("g.timePeriodBackgrounds").remove();
          bbs.length = 0;
          const periodMap = new Map();
          filteredNodes
            .filter(d => d.type === "Artwork")
            .forEach(art => {
              if (!periodMap.has(art.timePeriod)) periodMap.set(art.timePeriod, []);
              periodMap.get(art.timePeriod).push(art);
            });
          timePeriodMap = periodMap;
          drawTimeBoxes();
          // Recompute the radial scales based on new periods
          const periodList = Array.from(timePeriodMap.keys()).sort((a, b) => {
            const ay = +(/\d{3,4}/.exec(a) || [0])[0],
              by = +(/\d{3,4}/.exec(b) || [0])[0];
            return ay - by;
          });
          angleScale.domain(periodList);

          // update circle‐radius scale
          const counts = periodList.map(p => timePeriodMap.get(p).length);
          countScale.domain([0, d3.max(counts)]);

          // update the graph
          updateGraph(filteredNodes, filteredLinks);
          timeBG.remove();      // nukes the old <g>
          const newBG = container
            .insert("g", ":first-child")
            .attr("class", "timePeriodBackgrounds");

          for (let [period, arts] of periodMap) {
            const g = newBG.append("g").attr("class", "timePeriodBox");
            const rect = g.append("rect")
              .attr("fill", "rgba(200,200,255,0.15)")
              .attr("stroke", "rgba(120,120,255,0.5)")
              .attr("stroke-width", 1);
            const label = g.append("text")
              .attr("fill", "blue")
              .attr("font-size", 14)
              .attr("font-weight", "bold")
              .text(period);
            bbs.push({ period, rect, label });
          }

          // redraw graph
          updateGraph(filteredNodes, filteredLinks);


        });


        // — GRAPH UPDATE FUNCTION —
        function performHybridClustering(nodes, links) {
          // Skipping time period clustering
          return performCreatorClustering(nodes, links);
        }

        function performCreatorClustering(nodes, links) {
          let nn = nodes.slice(),
            nl = links.slice();
          const cmap = {};

          nl.forEach(l => {
            if (l.label === "created") {
              cmap[l.source] = cmap[l.source] || [];
              const art = nn.find(n => n.id === l.target && n.type === "Artwork");
              if (art) cmap[l.source].push(art);
            }
          });

          // for each creator, if they have more than the threshold number of artworks create cluster
          Object.entries(cmap).forEach(([cid, arts]) => {
            if (arts.length > creatorThreshold) {
              const clId = `cluster-creator-${cid.replace(/\W+/g, "_")}`;
              const cn = {
                id: clId,
                label: `${arts.length} works by ${cid}`,
                type: "CreatorCluster",
                creatorId: cid,
                collapsedNodes: arts
              };
              nn = nn.filter(n => !arts.some(a => a.id === n.id));
              nl = nl.filter(
                l => !(l.label === "created" && arts.some(a => a.id === l.target))
              );
              nl.push({ source: cid, target: clId, label: "created" });
              nn.push(cn);
            }
          });
          return { nodes: nn, links: nl };
        }

        // ——— HYBRID CLUSTERING ———
        const periodThreshold = 10,
          creatorThreshold = 5;

        function performTimeClustering(nodes, links) {
          let nn = nodes.slice(),
            nl = links.slice();
          for (let [period, arts] of timePeriodMap) {
            if (arts.length > periodThreshold) {
              const cid = `cluster-period-${period.replace(/\W+/g, "_")}`;
              const cn = {
                id: cid,
                label: `${arts.length} works in ${period}`,
                type: "TimePeriodCluster",
                timePeriod: period,
                collapsedNodes: arts
              };
              nn = nn.filter(n => !arts.some(a => a.id === n.id));
              nl = nl.filter(
                l => !(l.label === "created" && arts.some(a => a.id === l.target))
              );
              if (providerNode)
                nl.push({
                  source: providerNode.id,
                  target: cid,
                  label: "grouped by time"
                });
              nn.push(cn);
            }
          }
          return { nodes: nn, links: nl };
        }

        function performCreatorClustering(nodes, links) {
          let nn = nodes.slice(),
            nl = links.slice();
          const cmap = {};
          nl.forEach(l => {
            if (l.label === "created") {
              cmap[l.source] = cmap[l.source] || [];
              const art = nn.find(n => n.id === l.target && n.type === "Artwork");
              if (art) cmap[l.source].push(art);
            }
          });
          Object.entries(cmap).forEach(([cid, arts]) => {
            if (arts.length > creatorThreshold) {
              const clId = `cluster-creator-${cid.replace(/\W+/g, "_")}`;
              const cn = {
                id: clId,
                label: `${arts.length} works by ${cid}`,
                type: "CreatorCluster",
                creatorId: cid,
                collapsedNodes: arts
              };
              nn = nn.filter(n => !arts.some(a => a.id === n.id));
              nl = nl.filter(
                l => !(l.label === "created" && arts.some(a => a.id === l.target))
              );
              nl.push({ source: cid, target: clId, label: "created" });
              nn.push(cn);
            }
          });
          return { nodes: nn, links: nl };
        }

        function performHybridClustering(nodes, links) {
          const t = performTimeClustering(nodes, links);
          return performCreatorClustering(t.nodes, t.links);
        }

        function expandCluster(clusterNode, curNodes, curLinks) {
          let nn = curNodes.filter(n => n.id !== clusterNode.id),
            nl = curLinks.filter(l => l.target !== clusterNode.id);

          clusterNode.collapsedNodes.forEach(art => {
            nn.push(art);
            if (art.image) {
              // rebuild the pattern for the artwork
              defs.append("pattern")
                .attr("id", "pattern-" + art.id)
                .attr("width", 1)
                .attr("height", 1)
                .append("image")
                .attr("xlink:href", art.image)
                .attr("width", 20)
                .attr("height", 20)
                .attr("preserveAspectRatio", "xMidYMid slice");
            }


            if (clusterNode.type === "CreatorCluster") {
              nl.push({
                source: clusterNode.creatorId,
                target: art.id,
                label: "created"
              });
            } else {
              // restore all original created-by links from rawLinks
              rawLinks
                .filter(l => l.label === "created" && l.target === art.id)
                .forEach(l => nl.push({ ...l }));
            }
          });

          // pre-scatter the expanded nodes on a circle around the cluster center
          const cx = clusterNode.x, cy = clusterNode.y, R = 80;
          // only affect new ones
          clusterNode.collapsedNodes.forEach((art, i, arr) => {
            const θ = (2 * Math.PI) * (i / arr.length);
            const n = nn.find(d => d.id === art.id);
            n.x = cx + Math.cos(θ) * R;
            n.y = cy + Math.sin(θ) * R;
            n.vx = n.vy = 0;
          });

          // return rebuilt arrays
          return { nodes: nn, links: nl };
        }


        ({ nodes, links } = performHybridClustering(nodes, links));

        // ——— PATTERNS FOR ARTWORK IMAGES ———
        const defs = container.append("defs");
        nodes.forEach(d => {
          if (d.type === "Artwork" && d.image) {
            defs
              .append("pattern")
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

        // ——— RADIAL SCALES ———
        const periodList = Array.from(timePeriodMap.keys()).sort((a, b) => {
          const ay = +(/\d{3,4}/.exec(a) || [0])[0],
            by = +(/\d{3,4}/.exec(b) || [0])[0];
          return ay - by;
        });
        const angleScale = d3
          .scaleBand()
          .domain(periodList)
          .range([0, 2 * Math.PI])
          .padding(0.1);
        const counts = periodList.map(p => timePeriodMap.get(p).length);
        const maxCount = d3.max(counts);
        const countScale = d3
          .scaleSqrt()            // sqrt for diminishing returns
          .domain([0, maxCount])
          .range([100, 500]);     //  max radius of circle

        // ——— FORCE SIMULATION ———
        const simulation = d3
          .forceSimulation(nodes)
          .velocityDecay(0.4)                                   // more friction
          .force("charge", d3.forceManyBody()
            .strength(-20)                                      // weaker repulsion
            .theta(0.9)                                         // faster BH calc
            .distanceMax(400)
          )
          .force("collide", d3.forceCollide()
            .radius(d => + 2)
            .strength(0.2)                                      // softer separation
            .iterations(1)
          )
          .force(
            "link",
            d3
              .forceLink(links)
              .id(d => d.id)
              .distance(l => {
                if (l.label === "affiliated with") return 250;
                if (l.label === "created") return 100;
                if (l.label === "grouped by time") return 150;
                if (l.collaborative) return 80;
                return 150;
              })
          )
          .force("charge", d3.forceManyBody().strength(-30))
          .force(
            "collide",
            d3
              .forceCollide()
              .radius(d => {
                if (d.type === "Provider") return 30;
                if (d.type === "Creator") return 20;
                if (
                  d.type === "TimePeriodCluster" ||
                  d.type === "CreatorCluster"
                )
                  return clusterRadius(d) + 4;
                return 15;
              })
              .iterations(2)
          )
          .force(
            "x",
            d3.forceX(d => {
              if (d.type === "Artwork") {
                const ang = angleScale(d.timePeriod),
                  r = countScale(timePeriodMap.get(d.timePeriod).length);
                return width / 2 + r * Math.cos(ang);
              }
              return width / 2;
            }).strength(1)
          )
          .force(
            "y",
            d3.forceY(d => {
              if (d.type === "Artwork") {
                const ang = angleScale(d.timePeriod),
                  r = countScale(timePeriodMap.get(d.timePeriod).length);
                return height / 2 + r * Math.sin(ang);
              }
              return height / 2;
            }).strength(1)
          )

        // ——— LINK & NODE GROUPS ———
        const linkGroup = container.append("g").attr("class", "links");
        const nodeGroup = container.append("g").attr("class", "nodes");

        let linkSel = linkGroup
          .selectAll("line")
          .data(links)
          .join("line")
          .attr("fill", "none")
          .attr("stroke", d => d.collaborative ? "red" : "#aaa")
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", 1.5);

        let nodeSel = nodeGroup
          .selectAll("circle")
          .data(nodes)
          .join("circle")
          .attr("r", d => {
            if (d.type === "Provider") return 20;
            if (d.type === "Creator") return 10;
            if (
              d.type === "TimePeriodCluster" ||
              d.type === "CreatorCluster"
            )
              return 20;
            return 12;
          })
          .attr("fill", d => {
            if (d.type === "Artwork" && d.image)
              return `url(#pattern-${d.id})`;
            if (d.type === "Provider") return "gold";
            if (d.type === "Creator") return "darkgreen";
            if (d.type === "CreatorCluster") return "purple";
            if (d.type === "TimePeriodCluster") return "orange";
            return "steelblue";
          })
          .attr("stroke", d => {
            if (d.type === "Artwork") return "steelblue";
            if (d.type === "Provider") return "gold";
            if (d.type === "Creator") return "darkgreen";
            if (d.type === "CreatorCluster") return "purple";
            if (d.type === "TimePeriodCluster") return "orange";
            return "#fff";
          })
          .attr("stroke-width", 2)
          .on("mouseover", (e, d) => {
            d3.select(e.currentTarget)
              .transition()
              .duration(200)
              .attr("r", () => +d3.select(e.currentTarget).attr("r") * 1.5);
            let html = `<strong>${d.label}</strong><br>Type: ${d.type}`;
            if (d.type === "Artwork" && d.image)
              html =
                `<img src="${d.image}" width="150" style="display:block;margin-bottom:5px;">` +
                html;
            tooltip
              .html(html)
              .style("opacity", 1)
              .style("left", e.pageX + 10 + "px")
              .style("top", e.pageY + 10 + "px");
          })
          .on("mouseout", (e, d) => {
            d3.select(e.currentTarget)
              .transition()
              .duration(200)
              .attr("r", d => {
                if (d.type === "Provider") return 20;
                if (d.type === "Creator") return 10;
                if (
                  d.type === "TimePeriodCluster" ||
                  d.type === "CreatorCluster"
                )
                  return clusterRadius(d);
                return 12;
              });
            tooltip.style("opacity", 0);
          }).on("click", (e, d) => {
            if (d.type === "TimePeriodCluster" || d.type === "CreatorCluster") {
              expandClusterBatched(d, nodes, links);
            }
          })

          .call(
            d3
              .drag()
              .on("start", dragStarted)
              .on("drag", dragged)
              .on("end", dragEnded)
          );

        // ——— TICK HANDLER ———
        simulation.on("tick", () => {
          linkSel
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
          nodeSel.attr("cx", d => d.x).attr("cy", d => d.y);


          // update bounding boxes
          bbs.forEach(({ period, rect, label }) => {
            const arts = timePeriodMap.get(period) || [];
            if (!arts.length) return;
            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity;
            arts.forEach(a => {
              const n = nodes.find(n => n.id === a.id);
              if (!n) return;
              minX = Math.min(minX, n.x);
              maxX = Math.max(maxX, n.x);
              minY = Math.min(minY, n.y);
              maxY = Math.max(maxY, n.y);
            });
            if (minX === Infinity) return;
            const pad = 20;
            rect
              .attr("x", minX - pad)
              .attr("y", minY - pad)
              .attr("width", maxX - minX + pad * 2)
              .attr("height", maxY - minY + pad * 2);
            label.attr("x", minX + 5).attr("y", minY + 15);
          });
        });

        function updateGraph(updatedNodes, updatedLinks) {
          nodes = updatedNodes;
          links = updatedLinks;
          // clear & rebuild boxes for whatever's in timePeriodMap
          container.select("g.timePeriodBackgrounds").remove();
          bbs = [];
          drawTimeBoxes();
          //  RESTART simulation
          simulation.nodes(updatedNodes);
          simulation.force("link").links(updatedLinks);

          // REBUILD links
          linkSel = linkGroup.selectAll("line").data(updatedLinks, d => d.source.id + "-" + d.target.id);
          linkSel.exit().remove();
          linkSel = linkSel.enter().append("line")
            .attr("stroke-opacity", 0.8)
            .attr("stroke-width", 2)
            .merge(linkSel)
            .attr("stroke", d => (d.collaborative ? "red" : "#aaa"));

          // REBUILD nodes
          nodeSel = nodeGroup.selectAll("circle").data(updatedNodes, d => d.id);
          nodeSel.exit().remove();
          const nodeEnter = nodeSel.enter().append("circle");

          // MERGE enter + update
          nodeSel = nodeEnter.merge(nodeSel)
            .attr("r", d => {
              if (d.type === "Provider") return 20;
              if (d.type === "Creator") return 10;
              if (d.type === "TimePeriodCluster" || d.type === "CreatorCluster")
                return clusterRadius(d);
              return 12;
            })
            .attr("fill", d => {
              if (d.type === "Artwork" && d.image)
                return `url(#pattern-${d.id})`;
              if (d.type === "Provider") return "gold";
              if (d.type === "Creator") return "darkgreen";
              if (d.type === "CreatorCluster") return "purple";
              if (d.type === "TimePeriodCluster") return "orange";
              return "steelblue";
            })
            .attr("fill-opacity", d =>
              (d.type === "TimePeriodCluster" || d.type === "CreatorCluster") ? 0.7 : 1
            )

            .attr("stroke", d => {
              if (d.type === "Artwork") return "steelblue";
              if (d.type === "Provider") return "gold";
              if (d.type === "Creator") return "darkgreen";
              if (d.type === "CreatorCluster") return "purple";
              if (d.type === "TimePeriodCluster") return "orange";
              return "#fff";
            })
            .attr("stroke-width", 2)
            .on("mouseover", (e, d) => {
              d3.select(e.currentTarget).transition().duration(200)
                .attr("r", +d3.select(e.currentTarget).attr("r") * 1.5);
              let html = `<strong>${d.label}</strong><br>Type: ${d.type}`;
              if (d.type === "Artwork" && d.image) {
                html = `<img src="${d.image}" width="150" style="display:block;margin-bottom:5px;">` + html;
              }
              tooltip
                .html(html)
                .style("opacity", 1)
                .style("left", e.pageX + 10 + "px")
                .style("top", e.pageY + 10 + "px");
            })
            .on("mouseout", (e, d) => {
              d3.select(e.currentTarget).transition().duration(200)
                .attr("r", d => {
                  if (d.type === "Provider") return 20;
                  if (d.type === "Creator") return 10;
                  if (d.type === "TimePeriodCluster" || d.type === "CreatorCluster")
                    return clusterRadius(d);
                  return 12;
                });
              tooltip.style("opacity", 0);
            })
            .on("click", (e, d) => {
              if (d.type === "TimePeriodCluster" || d.type === "CreatorCluster") {
                // Expand the cluster
                const { nodes: newNodes, links: newLinks } = expandCluster(d, updatedNodes, updatedLinks);
                nodes = newNodes;
                links = newLinks;
                // Rebuild period-to-artwork map on the flattened node list
                timePeriodMap = new Map();
                newNodes
                  .filter(n => n.type === "Artwork")
                  .forEach(art => {
                    const tp = art.timePeriod;
                    if (!timePeriodMap.has(tp)) timePeriodMap.set(tp, []);
                    timePeriodMap.get(tp).push(art);
                  });


                // clear & redraw all boxes from the fresh map
                updateGraph(newNodes, newLinks);
              }
            })
            .call(d3.drag()
              .on("start", dragStarted)
              .on("drag", dragged)
              .on("end", dragEnded)
            );

          //restart the simulation
          simulation.alpha(1).restart();
        }



        ({ nodes, links } = performHybridClustering(rawNodes, rawLinks));
        updateGraph(nodes, links);


        // ——— DRAG HANDLERS ———
        function dragStarted(e, d) {
          if (!e.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        }
        function dragged(e, d) {
          d.fx = e.x;
          d.fy = e.y;
        }
        function dragEnded(e, d) {
          if (!e.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }

        /***********************************************
         * 5) TIMELINE SETUP 
         ***********************************************/
        const timelineWidth = 900,
          timelineHeight = 150,
          timelineMargin = { top: 20, right: 20, bottom: 30, left: 40 };

        // Clear previous timeline content
        d3.select("#timeline").selectAll("*").remove();

        // Create SVG and add a subtle background gradient
        const timelineSvg = d3
          .select("#timeline")
          .append("svg")
          .attr("width", timelineWidth)
          .attr("height", timelineHeight);

        // Define a linear gradient for the background
        const timelineDefs = timelineSvg.append("defs");
        const gradient = timelineDefs.append("linearGradient")
          .attr("id", "timelineGradient")
          .attr("x1", "0%")
          .attr("x2", "0%")
          .attr("y1", "0%")
          .attr("y2", "100%");

        gradient.append("stop")
          .attr("offset", "0%")
          .attr("stop-color", "#f0f8ff");
        gradient.append("stop")
          .attr("offset", "100%")
          .attr("stop-color", "#ffffff");

        timelineSvg.append("rect")
          .attr("width", timelineWidth)
          .attr("height", timelineHeight)
          .attr("fill", "url(#timelineGradient)");

        function parseYear(label) {
          const m = label.match(/\d{3,4}/);
          return m ? +m[0] : 0;
        }

        const timelineData = Array.from(timePeriodMap.entries())
          .filter(([_, arts]) => arts.length > 0)
          .map(([period, arts]) => ({
            label: period,
            year: parseYear(period)
          }))
          .filter(d => d.year > 0);

        const timelineDataRaw = Array.from(timePeriodMap.entries())
          .filter(([_, arts]) => arts.length > 0)
          .map(([period, arts]) => ({
            label: period,
            year: parseYear(period)
          }));

        const unknownTimelineData = timelineDataRaw.filter(d => d.year === 0);
        const unknownX = timelineMargin.left - 40;

        // Draw unknown timeline circles and labels
        timelineSvg
          .selectAll(".unknownCircle")
          .data(unknownTimelineData)
          .join("circle")
          .attr("class", "unknownCircle")
          .attr("cx", unknownX)
          .attr("cy", timelineHeight / 2)
          .attr("r", 8)
          .attr("fill", "#007acc")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1);

        timelineSvg
          .selectAll(".unknownLabel")
          .data(unknownTimelineData)
          .join("text")
          .attr("class", "unknownLabel")
          .attr("x", unknownX)
          .attr("y", timelineHeight / 2 - 12)
          .attr("text-anchor", "middle")
          .attr("fill", "#333")
          .attr("font-size", 12)
          .text("Unknown");

        // Define the horizontal scale and axis with grid lines
        const xExtent = d3.extent(timelineData, d => d.year);
        const xScale = d3
          .scaleLinear()
          .domain([xExtent[0] || 0, xExtent[1] || 100])
          .range([timelineMargin.left, timelineWidth - timelineMargin.right]);

        const xAxis = d3.axisBottom(xScale)
          .tickSize(-timelineHeight + timelineMargin.top + timelineMargin.bottom)
          .tickPadding(10)
          .tickFormat(d => (d === 0 ? "Unknown" : d));

        timelineSvg
          .append("g")
          .attr("transform", `translate(0,${timelineHeight - timelineMargin.bottom})`)
          .call(xAxis)
          .call(g => g.select(".domain").remove())
          .call(g => g.selectAll("line")
            .attr("stroke", "#ccc")
            .attr("stroke-dasharray", "2,2"));

        // Timeline circles with smooth transitions on hover
        timelineSvg
          .selectAll(".timelineCircle")
          .data(timelineData)
          .join("circle")
          .attr("class", "timelineCircle")
          .attr("cx", d => xScale(d.year))
          .attr("cy", timelineHeight / 2)
          .attr("r", 8)
          .attr("fill", "#007acc")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1)
          .on("mouseover", function (e, d) {
            d3.select(this)
              .transition()
              .duration(300)
              .attr("r", 12);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip
              .html(`<strong>${d.label}</strong><br>Year: ${d.year || "Unknown"}`)
              .style("left", e.pageX + 10 + "px")
              .style("top", e.pageY + 10 + "px");
          })
          .on("mouseout", function () {
            d3.select(this)
              .transition()
              .duration(300)
              .attr("r", 8);
            tooltip.transition().duration(200).style("opacity", 0);
          })
          .on("click", function (e, d) {
            document.getElementById("institution").value = d.label;
            document.getElementById("applyFilters").click();
          });

        timelineSvg
          .selectAll(".timelineLabel")
          .data(timelineData)
          .join("text")
          .attr("class", "timelineLabel")
          .attr("x", d => xScale(d.year))
          .attr("y", timelineHeight / 2 - 12)
          .attr("text-anchor", "middle")
          .attr("fill", "#333")
          .attr("font-size", 12)
          .text(d => d.label);

        // Artwork markers with improved positioning and hover transition
        const artworkTimelineData = [];
        for (let [period, arts] of timePeriodMap) {
          const year = parseYear(period);
          arts.forEach((art, i) => {
            artworkTimelineData.push({ period, year, artwork: art, index: i });
          });
        }

        timelineSvg
          .selectAll(".artworkTimelineMarker")
          .data(artworkTimelineData)
          .join("circle")
          .attr("class", "artworkTimelineMarker")
          .attr("cx", d => xScale(d.year) + (d.index % 3) * 4)
          .attr("cy", d => timelineHeight / 2 + 20 + Math.floor(d.index / 3) * 8)
          .attr("r", 4)
          .attr("fill", "orange")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1)
          .on("mouseover", function (e, d) {
            d3.select(this)
              .transition()
              .duration(200)
              .attr("r", 6);
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip
              .html(`<strong>${d.artwork.label}</strong><br>Period: ${d.period}`)
              .style("left", e.pageX + 10 + "px")
              .style("top", e.pageY + 10 + "px");
          })
          .on("mouseout", function () {
            d3.select(this)
              .transition()
              .duration(200)
              .attr("r", 4);
            tooltip.transition().duration(200).style("opacity", 0);
          })
          .on("click", function (e, d) {
            d3.selectAll(".nodes circle")
              .attr("stroke", nd => {
                if (nd.type === "Artwork") return "steelblue";
                if (nd.type === "Provider") return "gold";
                if (nd.type === "Creator") return "darkgreen";
                return "#fff";
              })
              .attr("stroke-width", 2);
            d3.selectAll(".nodes circle")
              .filter(nd => nd.id === d.artwork.id)
              .attr("stroke", "red")
              .attr("stroke-width", 4);
          });

        timelineSvg
          .selectAll(".unknownArtworkMarker")
          .data(artworkTimelineData.filter(d => d.year === 0))
          .join("circle")
          .attr("class", "unknownArtworkMarker")
          .attr("cx", d => unknownX + (d.index % 3) * 4)
          .attr("cy", d => timelineHeight / 2 + 20 + Math.floor(d.index / 3) * 8)
          .attr("r", 4)
          .attr("fill", "orange")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1);

        /***********************************************
         * 6) LEAFLET MAP 
         ***********************************************/
        let mapPoints = [];
        items.forEach(item => {
          const lat = item.edmPlaceLatitude?.[0],
            lon = item.edmPlaceLongitude?.[0];
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

        const map = L.map("map").setView([52.37, 4.89], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);

        const markerLayer = L.layerGroup().addTo(map);

        function updateMapMarkers(points) {
          markerLayer.clearLayers();
          points.forEach(p => {
            const popup = `
              <div style="max-width:200px">
                ${p.image ? `<img src="${p.image}" style="width:100%;margin-bottom:5px">` : ""}
                <strong>${p.title}</strong><br>
                <em>${p.creators.join(", ")}</em>
              </div>
            `;
            L.marker([p.lat, p.lon]).addTo(markerLayer).bindPopup(popup);
          });
          if (points.length) {
            const bounds = points.map(p => [p.lat, p.lon]);
            map.fitBounds(bounds, { padding: [20, 20] });
          }
        }

        updateMapMarkers(mapPoints);

        document.getElementById("applyFilters").addEventListener("click", () => {
          const sel = document.getElementById("institution").value;
          const filteredPoints =
            sel === "all"
              ? mapPoints
              : mapPoints.filter(p => p.timePeriod === sel);
          updateMapMarkers(filteredPoints);
        });
      })
      .catch(console.error);
  }

  /***********************************************
   * HELPERS: Title / Creators / Time / Media / Gallery / Cluster sizing
   ***********************************************/
  function getTitle(i) {
    return (
      i.title?.[0] ||
      i.dcTitleLangAware?.def?.[0] ||
      "Untitled"
    );
  }
  function getCreatorLabels(i) {
    if (i.edmAgentLabel?.length) {
      const L = i.edmAgentLabel
        .map(a => a.def)
        .filter(s => s && s.trim());
      if (L.length) return L;
    }
    return i.dcCreator?.length ? i.dcCreator : ["Unknown Artist"];
  }
  function getTimePeriod(i) {
    return (
      i.edmTimespanLabel?.[0].def ||
      "Unknown Period"
    );
  }
  function getMediaType(i) {
    return (
      i.dcTypeLangAware?.en?.[0] ||
      i.dcTypeLangAware?.def?.[0] ||
      "Artwork"
    );
  }
  function updateGallery(arr) {
    const g = document.getElementById("gallery");

    // Gracefully handle gallery element is missing
    if (!g) {
      console.error('Gallery element not found');
      return;
    }

    // Clear the gallery before updating
    g.innerHTML = "";

    // Loop through the items in the array to render the content
    arr.forEach(d => {
      if (!d.image) return; // Skip if no image is available

      // Create a container for each item
      const c = document.createElement("div");
      c.style.cssText =
        "width:140px;border:1px solid #ddd;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.1);background:#fff;margin:5px;font-family:sans-serif";

      // Create the image element
      const img = document.createElement("img");
      img.src = d.image;
      img.alt = d.label;
      img.style.cssText = "width:100%;display:block";

      // Create the caption for each item
      const cap = document.createElement("div");
      cap.textContent = d.label;
      cap.style.cssText = "font-size:12px;padding:6px 8px;text-align:center";

      // Append image and caption to the container
      c.append(img, cap);

      // append the container to the gallery
      g.appendChild(c);
    });
  }



  function clusterRadius(d) {
    const count = d.collapsedNodes?.length || 0;
    const r = 10 + Math.sqrt(count) * 5;
    return Math.min(r, 50);
  }

  // — FETCH DATA AND RENDER ARTWORKS —
  fetchAndRenderArtworks(API_URL);
});

