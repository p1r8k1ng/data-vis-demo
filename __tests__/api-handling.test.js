/**
 * @jest-environment jsdom
 */
import {
    buildColourFacetUrl,
    fetchColourFacets,
    fetchArtworks
  } from "../src/api";
  
  describe("src/api module", () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });
  
    afterEach(() => {
      jest.resetAllMocks();
    });
  
    it("buildColourFacetUrl puts the right facet and query", () => {
      const urlAll = buildColourFacetUrl("all");
      expect(urlAll).toContain("facet=COLOURPALETTE");
      expect(urlAll).toMatch(/query=\*/);
  
      const urlRem = buildColourFacetUrl("Rembrandt");
      expect(urlRem).toMatch(/query=who:\(Rembrandt\)/);
    });
  
    it("fetchColourFacets returns hex labels from the JSON", async () => {
      const fakeJSON = {
        facets: [
          { name: "COLOURPALETTE", fields: [{ label: "#AAA" }, { label: "#BBB" }] }
        ]
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(fakeJSON)
      });
  
      const hexes = await fetchColourFacets("all");
  
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("facet=COLOURPALETTE"));
      expect(hexes).toEqual(["#AAA", "#BBB"]);
    });
  
    it("fetchColourFacets returns empty array if no facet present", async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ facets: [] })
      });
  
      const hexes = await fetchColourFacets("all");
      expect(hexes).toEqual([]);
    });
  
    it("fetchArtworks resolves to `items` array or empty", async () => {
      const items = [{ id: 1 }, { id: 2 }];
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items })
      });
  
      const got = await fetchArtworks("any-url");
      expect(fetch).toHaveBeenCalledWith("any-url");
      expect(got).toEqual(items);
  
      // when items missing:
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({})
      });
      const empty = await fetchArtworks("any-url");
      expect(empty).toEqual([]);
    });
  });
  