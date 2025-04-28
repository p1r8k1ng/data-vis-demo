export function parseArtworks(items) {
  return items
    .filter(item => Array.isArray(item.edmIsShownBy) && item.edmIsShownBy.length)
    .map(item => {
      const id = item.id;
      const title =
        item.title?.[0] ||
        item.dcTitleLangAware?.def?.[0] ||
        "Untitled";
      const timePeriod =
        item.edmTimespanLabel?.[0]?.def ||
        "Unknown Period";
      const creators =
        Array.isArray(item.edmAgentLabel) && item.edmAgentLabel.length
          ? item.edmAgentLabel.map(a => a.def).filter(Boolean)
          : Array.isArray(item.dcCreator) && item.dcCreator.length
            ? item.dcCreator
            : ["Unknown Artist"];
      return { id, title, timePeriod, creators };
    });
}

/**
 * Groups an array of artworks by their timePeriod.
 * @param {Array} artworks - Parsed artworks
 * @returns {Map<string, Array>} Map of period -> artworks[]
 */
export function groupByTimePeriod(artworks) {
  const map = new Map();
  artworks.forEach(art => {
    const period = art.timePeriod;
    if (!map.has(period)) map.set(period, []);
    map.get(period).push(art);
  });
  return map;
}

/**
 * Groups an array of artworks by each creator label.
 * @param {Array} artworks - Parsed artworks
 * @returns {Map<string, Array>} Map of creator -> artworks[]
 */
export function groupByCreator(artworks) {
  const map = new Map();
  artworks.forEach(art => {
    art.creators.forEach(cr => {
      if (!map.has(cr)) map.set(cr, []);
      map.get(cr).push(art);
    });
  });
  return map;
}
