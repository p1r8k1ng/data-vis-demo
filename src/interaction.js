// src/interaction.js
import { updateColorFacetsFor, fetchAndRenderArtworks } from "../script";

// Artist‐dropdown change - updateColorFacetsFor
export function bindArtistDropdown(artistSelectEl = document.getElementById("artist")) {
  artistSelectEl.addEventListener("change", () => {
    updateColorFacetsFor(artistSelectEl.value);
  });
}

// Apply artist” button click →-fetchAndRenderArtworks
export function onApplyArtistFilter(
  artistSelectEl = document.getElementById("artist"),
  fetcher = fetchAndRenderArtworks
) {
  const a = artistSelectEl.value;
  const q = a === "all" ? "*" : `who:(${encodeURIComponent(a)})`;
  const url = [
    "https://api.europeana.eu/record/v2/search.json",
    `?wskey=teradowls`,
    `&query=${q}`,
    `&qf=DATA_PROVIDER:(%22Rijksmuseum%22)`,
    `&profile=rich&media=true&rows=50&sort=score+desc`
  ].join("");
  fetcher(url);
}
export function bindApplyArtistButton(buttonEl = document.getElementById("applyArtistFilter")) {
  buttonEl.onclick = () => onApplyArtistFilter();
}

// Apply color filter button click - fetchAndRenderArtworks
export function onApplyColorFilter(
  colorContainer = document.getElementById("color-options"),
  artistSelectEl = document.getElementById("artist"),
  fetcher = fetchAndRenderArtworks,
  alerter = window.alert
) {
  const selected = Array.from(
    colorContainer.querySelectorAll("input[type=checkbox]:checked")
  ).map(cb => cb.value);

  if (selected.length === 0) {
    alerter("Please select at least one colour.");
    return;
  }

  const artist = artistSelectEl.value === "all"
    ? "*"
    : `who:(${encodeURIComponent(artistSelectEl.value)})`;
  const colorParams = selected
    .map(c => `colourpalette=${encodeURIComponent(c)}`)
    .join("&");

  const url = [
    "https://api.europeana.eu/record/v2/search.json",
    `?wskey=teradowls`,
    `&query=${artist}`,
    `&qf=DATA_PROVIDER:(%22Rijksmuseum%22)`,
    "&media=true&rows=50&",
    colorParams
  ].join("");
  fetcher(url);
}
export function bindApplyColorButton(buttonEl = document.getElementById("applyColorFilter")) {
  buttonEl.onclick = () => onApplyColorFilter();
}

// Graph node click - expandClusterBatched
export function bindGraphNodeClicks(nodeGroup = document.querySelector(".nodes")) {
  nodeGroup.addEventListener("click", e => {
    const circle = e.target.closest("circle");
    if (!circle) return;
    const data = circle.__data__;        // get the data bound to the circle
    if (["TimePeriodCluster", "CreatorCluster"].includes(data?.type)) {
      // import the expandClusterBatched function dynamically
      import("./script").then(m => {
        m.expandClusterBatched(data, m.rawNodes, m.rawLinks);
      });
    }
  });
}

//  Initialise all interactions
export function initInteraction() {
  bindArtistDropdown();
  bindApplyArtistButton();
  bindApplyColorButton();
  bindGraphNodeClicks();
}
