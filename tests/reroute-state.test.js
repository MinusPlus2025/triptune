import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../frontend/integration.js", import.meta.url), "utf8");
function extract(name, next) {
  return source.slice(source.indexOf(`  ${name}`), source.indexOf(`  ${next}`));
}
function fixture() {
  const fields = {};
  const accept = {};
  const state = { replan: { original: "上海旧地点" }, replanVersion: 0, activeDay: 1, itinerary: { id: "beijing", destination: "北京", dayDetail: { nodes: [{ title: "北京新地点", time: "10:00" }] } } };
  let removed = false;
  const document = {
    getElementById: id => id === "apiRerouteSummary" ? { remove() { removed = true; } } : null,
    querySelectorAll: () => [], querySelector: () => accept
  };
  const ctx = { state, document, setText: (key, value) => { fields[key] = value; }, setI18n: (key, value) => { fields[key] = value; } };
  vm.createContext(ctx);
  vm.runInContext(extract("function resetReroute()", "function renderFeedback("), ctx);
  return { ctx, state, fields, accept, removed: () => removed };
}

test("changing itinerary clears the proposal and every previous comparison label", () => {
  const f = fixture();
  vm.runInContext("resetReroute(); renderRerouteBaseline();", f.ctx);
  assert.equal(f.state.replan, null);
  assert.equal(f.state.replanVersion, 1);
  assert.equal(f.removed(), true);
  assert.equal(f.accept.disabled, true);
  assert.equal(f.fields["#rerouteOriginalTitle"], "北京新地点");
  assert.match(f.fields.rerouteSub, /北京/);
  assert.match(f.fields["#rerouteReplacementTitle"], /等待/);
  assert.match(f.fields["#rerouteCoverageLabel"], /等待/);
  assert.ok(!JSON.stringify(f.fields).includes("上海"));
  const render = extract("function renderItinerary(", "function renderDynamicAfterTranslation(");
  assert.match(render, /resetReroute\(\)/);
});

test("a late proposal response cannot overwrite a newly selected trip", async () => {
  const f = fixture();
  let finish;
  let rendered = false;
  f.ctx.request = () => new Promise(resolve => { finish = resolve; });
  f.ctx.toast = () => {};
  f.ctx.addRerouteSummary = () => { rendered = true; };
  vm.runInContext(extract("async function selectIncidentFromApi(", "async function confirmRerouteFromApi("), f.ctx);
  const pending = vm.runInContext("selectIncidentFromApi('rain')", f.ctx);
  vm.runInContext("resetReroute()", f.ctx);
  finish({ original: "上海旧地点" });
  await pending;
  assert.equal(rendered, false);
  assert.equal(f.state.replan, null);
});
