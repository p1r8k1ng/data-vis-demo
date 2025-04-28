/**
 * @jest-environment jsdom
 */
 /**
  * __tests__/interaction.test.js
  */

 import {
    bindArtistDropdown,
    onApplyArtistFilter,
    bindApplyArtistButton,
    onApplyColorFilter,
    bindApplyColorButton
  } from "../src/interaction";
 
  
  // mock out the real implementations handlers call:
  jest.mock("../script", () => ({
    updateColorFacetsFor: jest.fn(),
    fetchAndRenderArtworks: jest.fn(),
  }));
  
  describe("User-interaction handlers", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <select id="artist">
          <option value="all">All</option>
          <option value="Rembrandt">Rembrandt</option>
        </select>
        <div id="color-options">
          <label><input type="checkbox" value="#fff"></label>
          <label><input type="checkbox" value="#000"></label>
        </div>
        <button id="applyArtistFilter">Artist</button>
        <button id="applyColorFilter">Color</button>
      `;
      jest.clearAllMocks();
    });
  
    describe("Artist dropdown → updateColorFacetsFor", () => {
      it("calls updateColorFacetsFor on change", () => {
        const { updateColorFacetsFor } = require("../script");
        bindArtistDropdown();
        const select = document.getElementById("artist");
        select.value = "Rembrandt";
        select.dispatchEvent(new Event("change"));
        expect(updateColorFacetsFor).toHaveBeenCalledWith("Rembrandt");
      });
    });
  
    describe("Apply‐artist button", () => {
      it("constructs the correct URL and calls fetchAndRenderArtworks", () => {
        const { fetchAndRenderArtworks } = require("../script");
        bindApplyArtistButton();
        // default is “all” - first call
        document.getElementById("applyArtistFilter").click();
        expect(fetchAndRenderArtworks).toHaveBeenCalledWith(
          expect.stringContaining("query=*")
        );
        // pick one artist - second call
        const sel = document.getElementById("artist");
        sel.value = "Rembrandt";
        document.getElementById("applyArtistFilter").click();
        expect(fetchAndRenderArtworks).toHaveBeenCalledWith(
          expect.stringContaining("query=who:(Rembrandt)")
        );
      });
    });
  
    describe("Apply‐colour button", () => {
      it("alerts if no colours selected", () => {
        const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
        onApplyColorFilter();          
        expect(alertSpy).toHaveBeenCalledWith("Please select at least one colour.");
      });
  
      it("builds URL with selected colours", () => {
        const { fetchAndRenderArtworks } = require("../script");
        // check a box
        document.querySelector("#color-options input[value=\"#000\"]").checked = true;
        onApplyColorFilter();
        expect(fetchAndRenderArtworks).toHaveBeenCalledWith(
          expect.stringContaining("colourpalette=%23000")
        );
      });
    });
  });
  