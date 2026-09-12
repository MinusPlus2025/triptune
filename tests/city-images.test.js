import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL("../frontend/city-images.js", import.meta.url), "utf8"), context);
const photos = context.window.tripTuneCityImages;

test("all six cities have distinct local JPEG covers and attribution", () => {
  assert.equal(Object.keys(photos).length, 6);
  assert.equal(new Set(Object.values(photos).map(p => p.src)).size, 6);
  for (const photo of Object.values(photos)) {
    const bytes = readFileSync(new URL(`../frontend${photo.src}`, import.meta.url));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.ok(photo.author && photo.license && photo.source.startsWith("https://commons.wikimedia.org/"));
  }
});

test("city cover binds the selected city and collapses on image failure", () => {
  const source = readFileSync(new URL("../frontend/integration.js", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("  function createCityCover("), source.indexOf("  function renderOverview("));
  const document = { createElement: tag => ({ tag, children: [], append(...items) { this.children.push(...items); }, remove() { this.removed = true; } }) };
  const create = vm.runInNewContext(`${fn}; createCityCover`, { ...context, document });
  for (const city of Object.keys(photos)) {
    const figure = create(city);
    assert.equal(figure.hidden, true);
    const img = figure.children[0];
    assert.equal(img.src, photos[city].src);
    assert.ok(img.alt.startsWith(city));
    img.onload();
    assert.equal(figure.hidden, false);
    img.onerror();
    assert.equal(figure.removed, true);
  }
  assert.equal(create("未知城市"), null);
});
