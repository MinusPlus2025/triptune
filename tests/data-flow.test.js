import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const testDataDir = mkdtempSync(path.join(tmpdir(), "triptune-test-"));
process.env.TRIPTUNE_DB_PATH = path.join(testDataDir, "triptune.sqlite");

const data = await import("../backend/database.js");
const { generatePlan, proposeReplan } = await import("../backend/recommender.js");

function build(input) {
  const profile = data.getProfile(input.profileId);
  const evidence = data.getPreferenceEvidence(input.profileId);
  const plan = generatePlan({ input, profile, evidence, places: data.listPlaces(input.destination) });
  return data.saveItinerary(data.createTripRequest(input), input, plan);
}

const linInput = {
  profileId: "demo-linmo",
  destination: "上海",
  durationDays: 3,
  budget: 5000,
  partySize: 1,
  interests: ["当代建筑", "独立书店", "深夜爵士"],
  pace: "relaxed"
};

const zhouInput = {
  profileId: "demo-zhouye",
  destination: "上海",
  durationDays: 5,
  budget: 8000,
  partySize: 2,
  interests: ["城市骑行", "工业遗存", "精酿酒馆"],
  pace: "dense"
};

test("different private data produces materially different itineraries", () => {
  const lin = build(linInput);
  const zhou = build(zhouInput);
  assert.equal(lin.days.length, 3);
  assert.equal(zhou.days.length, 5);
  assert.equal(lin.dayDetail.nodes.length, 2);
  assert.equal(zhou.dayDetail.nodes.length, 4);
  assert.notDeepEqual(lin.days.map((day) => day.activities), zhou.days.map((day) => day.activities));
});

test("feedback is accumulated and changes a subsequent result", () => {
  const before = build(linInput);
  const firstActivity = before.dayDetail.nodes[0].title;
  data.addFeedback("demo-linmo", firstActivity, "不感兴趣");
  const after = build(linInput);
  assert.ok(data.getPreferenceEvidence("demo-linmo").feedbackCount > 3);
  assert.notDeepEqual(before.days.map((day) => day.activities), after.days.map((day) => day.activities));
});

test("dislike labels from both languages are stored as negative feedback", () => {
  assert.equal(data.addFeedback("demo-linmo", "未排行程", "不喜欢").sentiment, "negative");
  assert.equal(data.addFeedback("demo-linmo", "Unscheduled activity", "Not for me").sentiment, "negative");
});

test("traveler profile edits persist and become recommendation inputs", () => {
  const before = data.getProfile("demo-linmo");
  const updated = data.updateProfile("demo-linmo", {
    name: "林默测试",
    budget: 6800,
    pace: "dense",
    interests: ["当代建筑", "自然徒步", "地方早餐"]
  });

  assert.equal(updated.name, "林默测试");
  assert.equal(updated.budget, 6800);
  assert.equal(updated.pace, "dense");
  assert.deepEqual(updated.interests, ["当代建筑", "自然徒步", "地方早餐"]);

  data.updateProfile("demo-linmo", before);
});

test("accepted replans persist in the itinerary database record", () => {
  const itinerary = data.getLatestItinerary("demo-linmo") || build(linInput);
  const proposal = proposeReplan({
    itinerary,
    incident: "rain",
    places: data.listPlaces("上海"),
    profile: data.getProfile("demo-linmo"),
    evidence: data.getPreferenceEvidence("demo-linmo")
  });
  const saved = data.saveReplan("demo-linmo", proposal);
  const accepted = data.acceptReplan(saved.id, "demo-linmo");
  assert.equal(accepted.replan.status, "accepted");
  assert.ok(accepted.itinerary.dayDetail.nodes.some((node) => node.title === accepted.replan.replacement));
});

test("every generated day can be opened as an editable day detail", () => {
  const itinerary = build({ ...linInput, durationDays: 3, pace: "balanced" });
  assert.equal(itinerary.days.length, 3);
  for (const day of itinerary.days) {
    assert.ok(day.activityDetails.length > 0);
    assert.ok(day.activityDetails.every((activity) => activity.id && activity.desc && activity.reason && activity.category));
  }
});

test("an edited stop persists and is returned everywhere from the same itinerary", () => {
  const itinerary = build({ ...linInput, destination: "杭州", durationDays: 2 });
  const activity = itinerary.days[0].activityDetails[0];
  const updated = data.updateItineraryActivity("demo-linmo", activity.id, {
    title: "西湖边的自定义散步",
    description: "按临时灵感调整后的散步安排。",
    time: "16:20 - 17:40"
  });

  const updatedActivity = updated.days[0].activityDetails[0];
  assert.equal(updatedActivity.title, "西湖边的自定义散步");
  assert.equal(updatedActivity.desc, "按临时灵感调整后的散步安排。");
  assert.equal(updatedActivity.time, "16:20 - 17:40");
  assert.equal(data.getLatestItinerary("demo-linmo").days[0].activities[0], "西湖边的自定义散步");
});

test("every supported destination produces only its own city content", () => {
  const destinations = data.listDestinations();
  assert.deepEqual(destinations.map(({ name }) => name), ["上海", "北京", "杭州", "成都", "广州", "南京"]);
  for (const destination of destinations) {
    const places = data.listPlaces(destination.name);
    assert.ok(places.length >= 18, `${destination.name} needs a useful candidate pool`);
    assert.ok(places.every((place) => place.destination === destination.name));
    const itinerary = build({ ...linInput, destination: destination.name });
    const usedPlaceIds = itinerary.dayDetail.nodes.map((node) => node.placeId);
    const cityPlaceIds = new Set(places.map(({ id }) => id));
    assert.ok(usedPlaceIds.every((placeId) => cityPlaceIds.has(placeId)), `${destination.name} leaked another city's places`);
    assert.equal(itinerary.destination, destination.name);
  }
});

test("rain rerouting has an indoor replacement in every supported city", () => {
  for (const destination of data.listDestinations()) {
    const itinerary = build({ ...linInput, destination: destination.name, pace: "dense" });
    const proposal = proposeReplan({
      itinerary,
      incident: "rain",
      places: data.listPlaces(destination.name),
      profile: data.getProfile("demo-linmo"),
      evidence: data.getPreferenceEvidence("demo-linmo")
    });
    assert.ok(proposal, `${destination.name} rain replan is missing`);
    const replacement = data.listPlaces(destination.name).find(({ id }) => id === proposal.replacementPlaceId);
    assert.equal(replacement.isIndoor, true, `${destination.name} rain replacement should be indoors`);
  }
});
