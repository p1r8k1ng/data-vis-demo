// src/api.js

const API_KEY  = "teradowls";
const PROVIDER = "Rijksmuseum";

/**
 * Build the URL for fetching colour‐facet data
 */
export function buildColourFacetUrl(artist) {
  const whoQuery = artist === "all"
    ? "*"
    : `who:(${encodeURIComponent(artist)})`;

  return [
    "https://api.europeana.eu/record/v2/search.json",
    `?wskey=${API_KEY}`,
    `&query=${whoQuery}`,
    `&qf=DATA_PROVIDER:("${encodeURIComponent(PROVIDER)}")`,
    "&profile=facets",
    "&media=true",
    "&rows=0",
    "&facet=COLOURPALETTE"
  ].join("");
}


export function fetchColourFacets(artist) {
  const url = buildColourFacetUrl(artist);
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Network error: ${res.status}`);
      return res.json();
    })
    .then(json => {
      const facet = json.facets?.find(f => f.name === "COLOURPALETTE");
      return facet ? facet.fields.map(f => f.label) : [];
    });
}

/**
 * Build the URL and fetch the raw `items` array from Europeana.
 */
export function fetchArtworks(apiUrl) {
  return fetch(apiUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Network error: ${res.status}`);
      return res.json();
    })
    .then(json => json.items || []);
}
