import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { cityCatalog, cityPlaces } from "./cities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.TRIPTUNE_DATA_DIR || path.join(rootDir, "data");
mkdirSync(dataDir, { recursive: true });

export const databasePath = process.env.TRIPTUNE_DB_PATH || path.join(dataDir, "triptune.sqlite");
export const db = new DatabaseSync(databasePath);

db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

const profiles = [
  {
    id: "demo-linmo",
    name: "林默",
    avatar: "LM",
    budget: 5000,
    pace: "balanced",
    interests: ["当代建筑", "独立书店", "深夜爵士", "小众手冲咖啡", "复古黑胶"],
    avoid: ["长时间排队", "频繁换区域", "过密安排"]
  },
  {
    id: "demo-zhouye",
    name: "周野",
    avatar: "ZY",
    budget: 8000,
    pace: "dense",
    interests: ["城市骑行", "精酿酒馆", "工业遗存", "街头摄影", "复古市集"],
    avoid: ["空档过长", "高价门票"]
  }
];

const places = [
  ["fosun-foundation", "复星艺术中心", "当代建筑", ["当代建筑", "艺术空间", "城市摄影"], "外滩", 120, 120, 0.8, 1, "下午", "观察可移动幕墙与黄浦江天际线。"],
  ["west-bund-museum", "西岸美术馆", "艺术展览", ["艺术空间", "当代建筑", "摄影展"], "西岸", 150, 100, 1.0, 1, "下午", "沿江展馆适合建筑、艺术与城市观察。"],
  ["tank-shanghai", "油罐艺术中心与滨江步道", "艺术漫游", ["艺术空间", "当代建筑", "户外", "步行"], "西岸", 120, 60, 2.2, 0, "傍晚", "在工业遗存改造空间与滨江日落之间漫游。"],
  ["duoyun-books", "朵云书院旗舰店", "独立书店", ["独立书店", "城市景观", "设计"], "陆家嘴", 90, 0, 0.5, 1, "下午", "在高层书店中浏览设计与城市文化书籍。"],
  ["jiantou-bookstore", "建投书局浦江店", "独立书店", ["独立书店", "建筑", "江景"], "北外滩", 90, 0, 0.6, 1, "下午", "以建筑主题选书和浦江景观见长。"],
  ["vinyl-villa", "衡复黑胶试听室", "复古黑胶", ["复古黑胶", "独立音乐", "室内"], "衡复", 90, 80, 0.4, 1, "下午", "试听中古唱片并与店主交流唱片版本。"],
  ["lincoln-jazz", "林肯爵士乐上海中心", "深夜爵士", ["深夜爵士", "现场音乐", "夜生活"], "外滩", 120, 280, 0.4, 1, "夜晚", "在老建筑中聆听小编制现场爵士。"],
  ["jz-club", "JZ Club 爵士现场", "深夜爵士", ["深夜爵士", "现场音乐", "夜生活"], "衡复", 120, 220, 0.5, 1, "夜晚", "以当晚乐手阵容为核心的现场音乐体验。"],
  ["coffee-ogram", "梧桐区主理人手冲吧", "小众手冲咖啡", ["小众手冲咖啡", "慢节奏", "室内"], "衡复", 60, 55, 0.3, 1, "上午", "用一杯单品手冲开启低压力的街区探索。"],
  ["coffee-roastery", "苏州河微型烘焙工坊", "小众手冲咖啡", ["小众手冲咖啡", "工业遗存", "室内"], "苏州河", 60, 48, 0.3, 1, "上午", "在旧仓库改造空间中体验当日烘焙。"],
  ["wukang-architecture", "武康路建筑观察线", "城市建筑", ["当代建筑", "历史建筑", "步行", "户外"], "衡复", 100, 0, 1.8, 0, "上午", "以街角尺度观察公寓、里弄与梧桐街区。"],
  ["sinan-lunch", "思南街区露台轻食", "本地餐饮", ["主理人小馆", "慢节奏", "历史建筑"], "衡复", 90, 88, 0.3, 0, "中午", "在老洋房街区留出完整午餐与休息时间。"],
  ["yuyuan-lanes", "愚园路弄堂与设计小店", "街区设计", ["历史建筑", "独立设计", "步行", "户外"], "静安", 120, 40, 1.6, 0, "下午", "沿弄堂观察微更新空间和独立设计店。"],
  ["urban-planning", "上海城市规划展示馆", "城市研究", ["当代建筑", "城市研究", "室内"], "人民广场", 120, 30, 0.4, 1, "上午", "从城市模型理解街区与交通的演变。"],
  ["m50", "M50 创意园工作室", "艺术园区", ["工业遗存", "独立设计", "艺术空间"], "苏州河", 120, 0, 1.0, 0, "下午", "探访纺织厂改造的画廊与创作者工作室。"],
  ["suhe-bike", "苏州河工业遗存骑行", "城市骑行", ["城市骑行", "工业遗存", "城市摄影", "户外"], "苏州河", 150, 60, 6.5, 0, "上午", "以骑行连接桥梁、仓库与滨水公共空间。"],
  ["yangpu-bike", "杨浦滨江骑行线", "城市骑行", ["城市骑行", "工业遗存", "户外"], "杨浦", 150, 60, 7.2, 0, "上午", "沿工业岸线快速穿行，保留多个摄影停靠点。"],
  ["brewery", "苏州河精酿酒馆", "精酿酒馆", ["精酿酒馆", "夜生活", "工业遗存"], "苏州河", 100, 168, 0.4, 1, "夜晚", "在当天路线附近以本地精酿收尾。"],
  ["yangpu-brewery", "杨浦社区精酿 taproom", "精酿酒馆", ["精酿酒馆", "本地社区", "夜生活"], "杨浦", 100, 138, 0.3, 1, "夜晚", "选择社区型酒馆，减少为网红店跨区移动。"],
  ["vintage-market", "虹口复古市集", "复古市集", ["复古市集", "复古黑胶", "街头摄影"], "虹口", 120, 120, 0.9, 1, "下午", "集中浏览唱片、海报与旧物摊位。"],
  ["hongkou-photo", "虹口旧里晨间街拍", "街头摄影", ["街头摄影", "历史建筑", "户外"], "虹口", 120, 0, 2.0, 0, "上午", "在商业活动开始前记录旧里与街道细节。"],
  ["yangpu-photo", "杨浦工业结构摄影段", "街头摄影", ["街头摄影", "工业遗存", "户外"], "杨浦", 120, 0, 2.4, 0, "下午", "利用稳定侧光拍摄仓库、栈桥与结构细节。"],
  ["power-station", "上海当代艺术博物馆", "艺术展览", ["当代建筑", "艺术空间", "工业遗存", "室内"], "南外滩", 150, 60, 0.8, 1, "下午", "在发电厂改造建筑中观看当期展览。"],
  ["ferry-sunset", "东金线轮渡与滨江落日", "城市景观", ["城市摄影", "户外", "慢节奏"], "外滩", 80, 20, 1.2, 0, "傍晚", "用公共轮渡连接两岸，在移动中观察城市天际线。"]
];

const seedFeedback = [
  ["seed-lin-1", "demo-linmo", "小型摄影展", "很像我", "positive", ["当代建筑", "摄影展", "艺术空间"]],
  ["seed-lin-2", "demo-linmo", "独立书店与黑胶试听", "很像我", "positive", ["独立书店", "复古黑胶"]],
  ["seed-lin-3", "demo-linmo", "露天长距离步行", "太赶了", "rushed", ["步行", "户外"]],
  ["seed-zhou-1", "demo-zhouye", "苏州河工业遗存骑行", "很像我", "positive", ["城市骑行", "工业遗存"]],
  ["seed-zhou-2", "demo-zhouye", "本地精酿酒馆", "很像我", "positive", ["精酿酒馆", "夜生活"]],
  ["seed-zhou-3", "demo-zhouye", "精品酒店下午茶", "不感兴趣", "negative", ["下午茶", "精品酒店"]]
];

function now() {
  return new Date().toISOString();
}

function parseJson(value, fallback = []) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanInterestLabel(value) {
  return String(value || "").replace(/^(?:apartment|nightlife|local_cafe|place|directions_bike|photo_camera|location_city|menu_book|headphones|landscape|storefront|palette|explore)/, "").trim();
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      default_budget_cents INTEGER NOT NULL CHECK (default_budget_cents > 0),
      default_pace TEXT NOT NULL CHECK (default_pace IN ('relaxed', 'balanced', 'dense')),
      avoid_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile_interests (
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      interest TEXT NOT NULL,
      base_weight REAL NOT NULL DEFAULT 1,
      position INTEGER NOT NULL,
      PRIMARY KEY (profile_id, interest)
    );

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      destination TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      area TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      walking_km REAL NOT NULL,
      is_indoor INTEGER NOT NULL CHECK (is_indoor IN (0, 1)),
      best_time TEXT NOT NULL,
      description TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_places_destination ON places(destination);

    CREATE TABLE IF NOT EXISTS destinations (
      name TEXT PRIMARY KEY,
      english_name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      aliases_json TEXT NOT NULL,
      transport TEXT NOT NULL,
      stay TEXT NOT NULL,
      radius TEXT NOT NULL,
      water TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trip_requests (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      destination TEXT NOT NULL,
      duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 14),
      budget_cents INTEGER NOT NULL CHECK (budget_cents > 0),
      party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 8),
      interests_json TEXT NOT NULL,
      pace TEXT NOT NULL CHECK (pace IN ('relaxed', 'balanced', 'dense')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS itineraries (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE REFERENCES trip_requests(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      destination TEXT NOT NULL,
      estimated_cost_cents INTEGER NOT NULL,
      engine TEXT NOT NULL,
      model_used TEXT,
      explanation_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_itineraries_profile_created ON itineraries(profile_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS itinerary_days (
      id TEXT PRIMARY KEY,
      itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
      day_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      weather TEXT NOT NULL,
      UNIQUE (itinerary_id, day_number)
    );

    CREATE TABLE IF NOT EXISTS itinerary_activities (
      id TEXT PRIMARY KEY,
      day_id TEXT NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
      place_id TEXT NOT NULL REFERENCES places(id),
      sequence INTEGER NOT NULL,
      time_range TEXT NOT NULL,
      reason TEXT NOT NULL,
      score REAL NOT NULL,
      UNIQUE (day_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      activity_id TEXT REFERENCES itinerary_activities(id) ON DELETE SET NULL,
      activity_title TEXT NOT NULL,
      label TEXT NOT NULL,
      sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative', 'rushed', 'neutral')),
      tags_json TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('demo-seed', 'live')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_profile_created ON feedback(profile_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS replans (
      id TEXT PRIMARY KEY,
      itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES profiles(id),
      incident TEXT NOT NULL,
      original_activity_id TEXT NOT NULL REFERENCES itinerary_activities(id),
      original_title TEXT NOT NULL,
      replacement_place_id TEXT NOT NULL REFERENCES places(id),
      reason TEXT NOT NULL,
      time_change TEXT NOT NULL,
      budget_change_cents INTEGER NOT NULL,
      walking_change TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('proposed', 'accepted')),
      created_at TEXT NOT NULL,
      accepted_at TEXT
    );
  `);
  const replanColumns = db.prepare("PRAGMA table_info(replans)").all().map(({ name }) => name);
  if (!replanColumns.includes("original_title")) {
    db.exec("ALTER TABLE replans ADD COLUMN original_title TEXT NOT NULL DEFAULT ''");
  }
  const activityColumns = db.prepare("PRAGMA table_info(itinerary_activities)").all().map(({ name }) => name);
  if (!activityColumns.includes("custom_title")) {
    db.exec("ALTER TABLE itinerary_activities ADD COLUMN custom_title TEXT");
  }
  if (!activityColumns.includes("custom_description")) {
    db.exec("ALTER TABLE itinerary_activities ADD COLUMN custom_description TEXT");
  }
}

function seedDatabase() {
  const insertProfile = db.prepare(`
    INSERT OR IGNORE INTO profiles
      (id, name, avatar, default_budget_cents, default_pace, avoid_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertInterest = db.prepare(`
    INSERT OR IGNORE INTO profile_interests (profile_id, interest, base_weight, position)
    VALUES (?, ?, ?, ?)
  `);
  for (const profile of profiles) {
    insertProfile.run(profile.id, profile.name, profile.avatar, profile.budget * 100, profile.pace, JSON.stringify(profile.avoid), now());
    profile.interests.forEach((interest, index) => insertInterest.run(profile.id, interest, Math.max(1, 3 - index * 0.35), index));
  }

  const insertDestination = db.prepare(`
    INSERT INTO destinations
      (name, english_name, code, aliases_json, transport, stay, radius, water)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      english_name = excluded.english_name,
      code = excluded.code,
      aliases_json = excluded.aliases_json,
      transport = excluded.transport,
      stay = excluded.stay,
      radius = excluded.radius,
      water = excluded.water
  `);
  for (const city of cityCatalog) {
    insertDestination.run(city.name, city.englishName, city.code, JSON.stringify(city.aliases), city.transport, city.stay, city.radius, city.water);
  }

  const insertPlace = db.prepare(`
    INSERT OR IGNORE INTO places
      (id, destination, title, category, tags_json, area, duration_minutes, price_cents, walking_km, is_indoor, best_time, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const place of places) {
    const [id, title, category, tags, area, duration, priceYuan, walkingKm, isIndoor, bestTime, description] = place;
    insertPlace.run(id, "上海", title, category, JSON.stringify(tags), area, duration, priceYuan * 100, walkingKm, isIndoor, bestTime, description);
  }
  for (const [destination, destinationPlaces] of Object.entries(cityPlaces)) {
    for (const place of destinationPlaces) {
      insertPlace.run(
        place.id, destination, place.title, place.category, JSON.stringify(place.tags), place.area,
        place.durationMinutes, place.priceYuan * 100, place.walkingKm, place.isIndoor ? 1 : 0,
        place.bestTime, place.description
      );
    }
  }

  const insertFeedback = db.prepare(`
    INSERT OR IGNORE INTO feedback
      (id, profile_id, activity_id, activity_title, label, sentiment, tags_json, source, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, 'demo-seed', ?)
  `);
  for (const [id, profileId, activity, label, sentiment, tags] of seedFeedback) {
    insertFeedback.run(id, profileId, activity, label, sentiment, JSON.stringify(tags), now());
  }
}

initializeSchema();
seedDatabase();

function profileRow(profileId) {
  return db.prepare("SELECT * FROM profiles WHERE id = ?").get(profileId);
}

export function listProfiles() {
  return db.prepare("SELECT id FROM profiles ORDER BY created_at, id").all().map(({ id }) => getProfile(id));
}

export function listDestinations() {
  return db.prepare("SELECT * FROM destinations ORDER BY rowid").all().map((row) => ({
    name: row.name,
    englishName: row.english_name,
    code: row.code,
    aliases: parseJson(row.aliases_json),
    transport: row.transport,
    stay: row.stay,
    radius: row.radius,
    water: row.water,
    placeCount: db.prepare("SELECT COUNT(*) AS count FROM places WHERE destination = ?").get(row.name).count
  }));
}

export function getDestination(name) {
  return listDestinations().find((destination) => destination.name === name) || null;
}

export function getProfile(profileId) {
  const row = profileRow(profileId);
  if (!row) return null;
  const interests = db.prepare("SELECT interest, base_weight FROM profile_interests WHERE profile_id = ? ORDER BY position").all(profileId);
  const evidence = getPreferenceEvidence(profileId);
  const orderedInterests = [...interests]
    .sort((a, b) => (b.base_weight + (evidence.tagWeights[a.interest] || 0)) - (a.base_weight + (evidence.tagWeights[b.interest] || 0)))
    .map(({ interest }) => interest);
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    budget: row.default_budget_cents / 100,
    interests: orderedInterests,
    signals: `旅行偏好：${orderedInterests.slice(0, 3).join(" / ")}`,
    pace: row.default_pace,
    avoid: parseJson(row.avoid_json),
    learning: {
      feedbackCount: evidence.feedbackCount,
      liveFeedbackCount: evidence.liveFeedbackCount,
      rushedCount: evidence.rushedCount,
      topLearnedSignals: evidence.topLearnedSignals
    }
  };
}

export function updateProfile(profileId, input) {
  const existing = profileRow(profileId);
  if (!existing) return null;
  const name = String(input.name || "").trim();
  const budget = Number(input.budget);
  const pace = String(input.pace || "");
  const interests = [...new Set((input.interests || []).map((interest) => String(interest).trim()).filter(Boolean))];

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE profiles
      SET name = ?, default_budget_cents = ?, default_pace = ?, avatar = ?
      WHERE id = ?
    `).run(name, Math.round(budget * 100), pace, input.avatar === undefined ? existing.avatar : input.avatar, profileId);
    db.prepare("DELETE FROM profile_interests WHERE profile_id = ?").run(profileId);
    const insertInterest = db.prepare(`
      INSERT INTO profile_interests (profile_id, interest, base_weight, position)
      VALUES (?, ?, ?, ?)
    `);
    interests.forEach((interest, index) => {
      insertInterest.run(profileId, interest, Math.max(1, 3 - index * 0.35), index);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getProfile(profileId);
}

export function getPreferenceEvidence(profileId) {
  const rows = db.prepare("SELECT sentiment, tags_json, source FROM feedback WHERE profile_id = ? ORDER BY created_at").all(profileId);
  const tagWeights = {};
  let rushedCount = 0;
  let liveFeedbackCount = 0;
  for (const row of rows) {
    const weight = row.sentiment === "positive" ? 2 : row.sentiment === "negative" ? -2 : row.sentiment === "rushed" ? -0.35 : 0;
    if (row.sentiment === "rushed") rushedCount += 1;
    if (row.source === "live") liveFeedbackCount += 1;
    for (const tag of parseJson(row.tags_json)) tagWeights[tag] = (tagWeights[tag] || 0) + weight;
  }
  const topLearnedSignals = Object.entries(tagWeights)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, weight]) => ({ tag, weight }));
  return { feedbackCount: rows.length, liveFeedbackCount, rushedCount, tagWeights, topLearnedSignals };
}

export function listPlaces(destination) {
  return db.prepare("SELECT * FROM places WHERE destination = ? ORDER BY id").all(destination).map((row) => ({
    id: row.id,
    destination: row.destination,
    title: row.title,
    category: row.category,
    tags: parseJson(row.tags_json),
    area: row.area,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    walkingKm: row.walking_km,
    isIndoor: Boolean(row.is_indoor),
    bestTime: row.best_time,
    description: row.description
  }));
}

export function createTripRequest(input) {
  const id = `req-${randomUUID()}`;
  db.prepare(`
    INSERT INTO trip_requests
      (id, profile_id, destination, duration_days, budget_cents, party_size, interests_json, pace, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.profileId, input.destination, input.durationDays, input.budget * 100, input.partySize, JSON.stringify(input.interests), input.pace, now());
  return id;
}

export function saveItinerary(requestId, input, plan) {
  const itineraryId = `trip-${randomUUID()}`;
  const createdAt = now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO itineraries
        (id, request_id, profile_id, destination, estimated_cost_cents, engine, model_used, explanation_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itineraryId, requestId, input.profileId, input.destination, plan.estimatedCostCents, plan.engine, plan.modelUsed || null, JSON.stringify(plan.explanation), createdAt);

    const insertDay = db.prepare(`INSERT INTO itinerary_days (id, itinerary_id, day_number, title, description, weather) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertActivity = db.prepare(`
      INSERT INTO itinerary_activities (id, day_id, place_id, sequence, time_range, reason, score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const day of plan.days) {
      const dayId = `day-${randomUUID()}`;
      insertDay.run(dayId, itineraryId, day.id, day.title, day.desc, day.weather);
      day.activities.forEach((activity, index) => {
        insertActivity.run(`act-${randomUUID()}`, dayId, activity.place.id, index + 1, activity.time, activity.reason, activity.score);
      });
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getItineraryById(itineraryId);
}

export function getLatestItinerary(profileId) {
  const row = db.prepare("SELECT id FROM itineraries WHERE profile_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(profileId);
  return row ? getItineraryById(row.id) : null;
}

export function listItineraries(profileId) {
  return db.prepare(`SELECT i.id, i.destination, i.created_at AS createdAt,
    r.duration_days AS durationDays, r.budget_cents / 100.0 AS budget
    FROM itineraries i JOIN trip_requests r ON r.id = i.request_id
    WHERE i.profile_id = ? ORDER BY i.created_at DESC, i.rowid DESC LIMIT 100`).all(profileId);
}

export function getItineraryById(itineraryId) {
  const row = db.prepare(`
    SELECT i.*, r.duration_days, r.budget_cents, r.party_size, r.interests_json, r.pace
    FROM itineraries i JOIN trip_requests r ON r.id = i.request_id WHERE i.id = ?
  `).get(itineraryId);
  if (!row) return null;
  const dayRows = db.prepare("SELECT * FROM itinerary_days WHERE itinerary_id = ? ORDER BY day_number").all(itineraryId);
  const activityStatement = db.prepare(`
    SELECT ia.*, COALESCE(NULLIF(ia.custom_title, ''), p.title) AS title,
           COALESCE(NULLIF(ia.custom_description, ''), p.description) AS description,
           p.category, p.tags_json, p.area, p.duration_minutes,
           p.price_cents, p.walking_km, p.is_indoor, p.best_time
    FROM itinerary_activities ia JOIN places p ON p.id = ia.place_id
    WHERE ia.day_id = ? ORDER BY ia.sequence
  `);
  const fullDays = dayRows.map((day) => {
    const activities = activityStatement.all(day.id).map((activity) => ({
      id: activity.id,
      placeId: activity.place_id,
      time: activity.time_range,
      title: activity.title,
      desc: activity.description,
      category: activity.category,
      meta: `${activity.area} · ${activity.duration_minutes}分钟 · ¥${Math.round(activity.price_cents / 100)}/人`,
      reason: activity.reason,
      score: activity.score,
      tags: parseJson(activity.tags_json),
      durationMinutes: activity.duration_minutes,
      priceCents: activity.price_cents,
      walkingKm: activity.walking_km,
      isIndoor: Boolean(activity.is_indoor)
    }));
    const walking = activities.reduce((sum, activity) => sum + activity.walkingKm, 0);
    return {
      id: day.day_number,
      title: day.title,
      desc: day.description,
      distance: `${[...new Set(activities.map((activity) => activity.meta.split(" · ")[0]))].join(" / ")} · ${walking.toFixed(1)}公里`,
      weather: day.weather,
      activities: activities.map((activity) => activity.title),
      activityDetails: activities,
      nodes: activities
    };
  });
  const detailDay = fullDays[Math.min(1, fullDays.length - 1)] || fullDays[0];
  const detailWalking = detailDay?.nodes.reduce((sum, activity) => sum + activity.walkingKm, 0) || 0;
  return {
    id: row.id,
    requestId: row.request_id,
    profileId: row.profile_id,
    destination: row.destination,
    durationDays: row.duration_days,
    budget: row.budget_cents / 100,
    partySize: row.party_size,
    pace: row.pace,
    selectedInterests: parseJson(row.interests_json).map(cleanInterestLabel).filter(Boolean),
    estimatedCost: row.estimated_cost_cents / 100,
    engine: row.engine,
    modelUsed: row.model_used,
    explanation: parseJson(row.explanation_json, {}),
    createdAt: row.created_at,
    days: fullDays.map(({ nodes, ...day }) => day),
    dayDetail: detailDay ? {
      day: detailDay.id,
      title: detailDay.title,
      totalDistance: `${detailWalking.toFixed(1)} km`,
      transit: `约 ${Math.max(25, detailDay.nodes.length * 15)} 分钟`,
      weather: detailDay.weather,
      nodes: detailDay.nodes
    } : null
  };
}

export function updateItineraryActivity(profileId, activityId, input) {
  const row = db.prepare(`
    SELECT ia.id, d.itinerary_id
    FROM itinerary_activities ia
    JOIN itinerary_days d ON d.id = ia.day_id
    JOIN itineraries i ON i.id = d.itinerary_id
    WHERE ia.id = ? AND i.profile_id = ?
  `).get(activityId, profileId);
  if (!row) return null;

  db.prepare(`
    UPDATE itinerary_activities
    SET custom_title = ?, custom_description = ?, time_range = ?
    WHERE id = ?
  `).run(
    String(input.title || "").trim(),
    String(input.description || "").trim(),
    String(input.time || "").trim(),
    activityId
  );
  return getItineraryById(row.itinerary_id);
}

function sentimentFromLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("很像我") || normalized.includes("like me")) return "positive";
  if (normalized.includes("太赶") || normalized.includes("rushed")) return "rushed";
  if (normalized.includes("不感兴趣") || normalized.includes("不喜欢") || normalized.includes("not interested") || normalized.includes("not for me")) return "negative";
  return "neutral";
}

export function addFeedback(profileId, activityTitle, label) {
  const activity = db.prepare(`
    SELECT ia.id, p.tags_json
    FROM itinerary_activities ia
    JOIN itinerary_days d ON d.id = ia.day_id
    JOIN itineraries i ON i.id = d.itinerary_id
    JOIN places p ON p.id = ia.place_id
    WHERE i.profile_id = ? AND p.title = ?
    ORDER BY i.created_at DESC LIMIT 1
  `).get(profileId, activityTitle);
  const id = `fb-${randomUUID()}`;
  db.prepare(`
    INSERT INTO feedback
      (id, profile_id, activity_id, activity_title, label, sentiment, tags_json, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?)
  `).run(id, profileId, activity?.id || null, activityTitle, label, sentimentFromLabel(label), activity?.tags_json || "[]", now());
  return { id, activity: activityTitle, label, sentiment: sentimentFromLabel(label), createdAt: now(), source: "live" };
}

export function listFeedback(profileId) {
  return db.prepare(`
    SELECT id, activity_title AS activity, label, sentiment, source, created_at AS createdAt
    FROM feedback WHERE profile_id = ? ORDER BY created_at
  `).all(profileId);
}

export function saveReplan(profileId, plan) {
  const id = `replan-${randomUUID()}`;
  db.prepare(`
    INSERT INTO replans
      (id, itinerary_id, profile_id, incident, original_activity_id, original_title, replacement_place_id,
       reason, time_change, budget_change_cents, walking_change, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)
  `).run(id, plan.itineraryId, profileId, plan.incident, plan.originalActivityId, plan.originalTitle, plan.replacementPlaceId, plan.reason, plan.timeChange, plan.budgetChangeCents, plan.walking, now());
  return getReplan(id);
}

export function getReplan(replanId) {
  const row = db.prepare(`
    SELECT r.*, ia.time_range AS original_time, replacement.title AS replacement,
           replacement.best_time AS replacement_time
    FROM replans r
    JOIN itinerary_activities ia ON ia.id = r.original_activity_id
    JOIN places replacement ON replacement.id = r.replacement_place_id
    WHERE r.id = ?
  `).get(replanId);
  if (!row) return null;
  return {
    id: row.id,
    itineraryId: row.itinerary_id,
    profileId: row.profile_id,
    incident: row.incident,
    originalActivityId: row.original_activity_id,
    originalTime: row.original_time,
    replacementPlaceId: row.replacement_place_id,
    original: row.original_title,
    replacement: row.replacement,
    replacementTime: row.replacement_time,
    reason: row.reason,
    timeChange: row.time_change,
    budgetChange: row.budget_change_cents / 100,
    walking: row.walking_change,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at
  };
}

export function acceptReplan(replanId, profileId) {
  const row = db.prepare("SELECT * FROM replans WHERE id = ? AND profile_id = ?").get(replanId, profileId);
  if (!row) return null;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE itinerary_activities SET place_id = ? WHERE id = ?").run(row.replacement_place_id, row.original_activity_id);
    db.prepare("UPDATE replans SET status = 'accepted', accepted_at = ? WHERE id = ?").run(now(), replanId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { replan: getReplan(replanId), itinerary: getItineraryById(row.itinerary_id) };
}

export function latestAcceptedReplan(profileId) {
  const row = db.prepare("SELECT id FROM replans WHERE profile_id = ? AND status = 'accepted' ORDER BY accepted_at DESC LIMIT 1").get(profileId);
  return row ? getReplan(row.id) : null;
}

export function latestProposedReplan(profileId, incident) {
  const row = db.prepare(`
    SELECT id FROM replans
    WHERE profile_id = ? AND incident = ? AND status = 'proposed'
    ORDER BY created_at DESC LIMIT 1
  `).get(profileId, incident);
  return row ? getReplan(row.id) : null;
}

export function databaseStats(profileId) {
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM trip_requests WHERE profile_id = ?) AS requests,
      (SELECT COUNT(*) FROM itineraries WHERE profile_id = ?) AS itineraries,
      (SELECT COUNT(*) FROM feedback WHERE profile_id = ?) AS feedback,
      (SELECT COUNT(*) FROM replans WHERE profile_id = ? AND status = 'accepted') AS acceptedReplans
  `).get(profileId, profileId, profileId, profileId);
  return { ...counts, database: "SQLite", persistence: "server-restart" };
}

export function resetLiveDemoData() {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM replans; DELETE FROM itineraries; DELETE FROM trip_requests; DELETE FROM feedback WHERE source = 'live';");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
