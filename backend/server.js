import http from "node:http";
import { accountFor, login, logout, listMemories, saveMemory, deleteMemory } from "./accounts.js";
import { proposeTrip } from "./planning-assistant.js";
import { getWeather } from "./weather.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptReplan,
  addFeedback,
  createTripRequest,
  databasePath,
  databaseStats,
  getDestination,
  getItineraryById,
  getLatestItinerary,
  getPreferenceEvidence,
  getProfile,
  latestAcceptedReplan,
  latestProposedReplan,
  listFeedback,
  listDestinations,
  listPlaces,
  listProfiles,
  listItineraries,
  manageItinerary,
  resetLiveDemoData,
  saveItinerary,
  saveReplan,
  updateItineraryActivity,
  updateProfile
} from "./database.js";
import { generatePlan, proposeReplan } from "./recommender.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const port = Number(process.env.PORT || 7860);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const allowedPaces = new Set(["relaxed", "balanced", "dense"]);
const allowedIncidents = new Set(["rain", "delay", "cancel", "traffic"]);
let authWindow = 0;
let authAttempts = 0;

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function apiError(res, status, type, message, field) {
  return json(res, status, { error: { type, message, ...(field ? { field } : {}) } });
}

async function parseBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error("body_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (req.account) body.profileId = req.account.profile_id;
    if (req.account && body.itineraryId && getItineraryById(body.itineraryId)?.profileId !== req.account.profile_id) throw new Error("invalid_json");
    return body;
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

function cleanText(value, maxLength = 80) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function normalizePartySize(value) {
  if (Number.isInteger(Number(value))) return Number(value);
  const parsed = Number(String(value || "").match(/\d+/)?.[0]);
  return Number.isInteger(parsed) ? parsed : 1;
}

function normalizeTripInput(raw) {
  const profile = getProfile(cleanText(raw.profileId || "demo-linmo", 48));
  if (!profile) return { error: ["profileId", "找不到该演示旅人。"] };
  const destinationInput = cleanText(raw.destination, 32).replace(/\s*\([^)]*\)\s*/g, "").toLowerCase();
  if (!destinationInput) return { error: ["destination", "请输入目的地后再生成旅程。"] };
  const supportedDestinations = listDestinations();
  const destinationRecord = supportedDestinations.find((city) => {
    const names = [city.name, city.englishName, city.code, ...city.aliases].map((name) => String(name).toLowerCase());
    return names.includes(destinationInput) || city.name.replace(/市$/, "").toLowerCase() === destinationInput.replace(/市$/, "");
  });
  if (!destinationRecord) {
    return { error: ["destination", `当前支持：${supportedDestinations.map(({ name }) => name).join("、")}。请输入其中一个城市。`] };
  }
  const destination = destinationRecord.name;
  const durationDays = Number(raw.durationDays || 3);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 7) return { error: ["durationDays", "出行天数须为 1–7 天。"] };
  const budget = Number(raw.budget || profile.budget);
  if (!Number.isFinite(budget) || budget < 500 || budget > 100000) return { error: ["budget", "预算须在 ¥500–¥100,000 之间。"] };
  const partySize = normalizePartySize(raw.partySize);
  if (partySize < 1 || partySize > 8) return { error: ["partySize", "同行人数须为 1–8 人。"] };
  const interests = Array.isArray(raw.interests)
    ? [...new Set(raw.interests.map((interest) => cleanText(interest, 24)).filter(Boolean))].slice(0, 8)
    : [];
  if (!interests.length) return { error: ["interests", "请至少选择一个旅行兴趣。"] };
  const pace = allowedPaces.has(raw.pace) ? raw.pace : profile.pace;
  return { profileId: profile.id, destination, durationDays, budget: Math.round(budget), partySize, interests, pace };
}

function buildItinerary(input) {
  const profile = getProfile(input.profileId);
  const evidence = getPreferenceEvidence(input.profileId);
  const places = listPlaces(input.destination);
  if (!places.length) throw Object.assign(new Error("destination_not_supported"), { status: 422 });
  const plan = generatePlan({ input, profile, evidence, places });
  const requestId = createTripRequest(input);
  const itinerary = saveItinerary(requestId, input, plan);
  return { profile: getProfile(input.profileId), destination: getDestination(input.destination), itinerary, evidence };
}

function ensureLatestItinerary(profileId) {
  // A GET must never invent a destination or silently persist a trip. The
  // itinerary only exists after the visitor submits the departure brief.
  return getLatestItinerary(profileId);
}

async function api(req, res, pathname) {
  res.setHeader('Cache-Control','no-store');
  if (req.method === "POST" && !String(req.headers["content-type"] || "").startsWith("application/json")) return apiError(res,415,"content_type","请使用 JSON 请求。");
  if (req.method === "POST" && req.headers["sec-fetch-site"] === "cross-site") return apiError(res,403,"forbidden","不允许跨站请求。");
  const account = accountFor(req);
  if (pathname === "/api/auth/me") return account ? json(res,200,{profileId:account.profile_id,username:account.username}) : apiError(res,401,"login_required","请先登录。");
  if (req.method === "POST" && ["/api/auth/login","/api/auth/register"].includes(pathname)) {
    if(Date.now()-authWindow>60000){authWindow=Date.now();authAttempts=0;}
    if(++authAttempts>20)return apiError(res,429,"rate_limit","尝试过于频繁，请一分钟后重试。");
    const body=await parseBody(req);
    try {
      const result=login(body.username,body.password,pathname.endsWith("register"));
      res.setHeader("Set-Cookie",`triptune_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
      return json(res,200,{profileId:result.profileId});
    } catch { return apiError(res,400,"auth_failed","无法登录或注册。检查用户名、密码（至少10位），或换一个用户名。"); }
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") {
    logout(req);res.setHeader("Set-Cookie","triptune_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");return json(res,200,{ok:true});
  }
  const publicRead=req.method === "GET" && (pathname === "/api/health" || pathname === "/api/destinations" || pathname.startsWith("/api/weather/"));
  if (!publicRead) {
    if (!account) return apiError(res,401,"login_required","请先登录。");
    req.account=account;
    const scoped=pathname.match(/^\/api\/(?:profiles|keepsake)\/([^/]+)/);
    if(scoped && scoped[1]!==account.profile_id)return apiError(res,404,"not_found","找不到记录。");
    const trip=pathname.match(/^\/api\/itineraries\/([^/]+)$/);
    if(trip && trip[1]!==account.profile_id && getItineraryById(trip[1])?.profileId!==account.profile_id)return apiError(res,404,"not_found","找不到记录。");
    if(pathname==="/api/profiles")return json(res,200,[getProfile(account.profile_id)]);
    if(pathname==="/api/demo/reset")return apiError(res,403,"forbidden","该操作已关闭。");
  }
  if(pathname==="/api/memories" && req.method==="GET")return json(res,200,listMemories(account.id));
  if(pathname==="/api/memories" && req.method==="POST") {
    const body=await parseBody(req);
    try { return json(res,200,{id:saveMemory(account.id,body)}); } catch {return apiError(res,422,"invalid_memory","保存失败，请检查日期、文字和照片大小。");}
  }
  const memory=pathname.match(/^\/api\/memories\/([a-f0-9-]+)\/delete$/);
  if(memory && req.method==="POST")return deleteMemory(account.id,memory[1])?json(res,200,{ok:true}):apiError(res,404,"not_found","找不到记录。");
  if (req.method === "POST" && pathname === "/api/planning/interpret") {
    const body = await parseBody(req);
    try { return json(res, 200, await proposeTrip(body.message)); }
    catch (error) {
      const messages = {invalid_message:"请用2000字以内描述旅行想法。",ai_not_configured:"对话服务尚未配置，请稍后重试。",ai_limit:"当前对话较多，请稍后再试。"};
      return apiError(res, error.message === "invalid_message" ? 422 : 503, "planning_unavailable", messages[error.message] || "暂时没能整理好，请重试或手动填写。");
    }
  }
  if (req.method === "GET" && pathname.startsWith("/api/weather/")) {
    try { return json(res, 200, await getWeather(decodeURIComponent(pathname.slice(13)))); }
    catch { return apiError(res, 503, "weather_unavailable", "天气暂未更新，请稍后重试。"); }
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    });
    return res.end();
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      service: "triptune-api",
      storage: "sqlite",
      databaseReady: Boolean(databasePath),
      time: new Date().toISOString()
    });
  }

  if (req.method === "GET" && pathname === "/api/profiles") {
    return json(res, 200, listProfiles());
  }

  if (req.method === "GET" && pathname === "/api/destinations") {
    return json(res, 200, listDestinations());
  }

  const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
  const historyMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/trips$/);
  if (req.method === "GET" && historyMatch) {
    if (!getProfile(historyMatch[1])) return apiError(res, 404, "profile_not_found", "找不到该旅人。");
    return json(res, 200, listItineraries(historyMatch[1]));
  }
  if (req.method === "GET" && profileMatch) {
    const profile = getProfile(profileMatch[1]);
    return profile ? json(res, 200, profile) : apiError(res, 404, "profile_not_found", "找不到该旅人。", "profileId");
  }

  if (req.method === "POST" && profileMatch) {
    const profileId = cleanText(profileMatch[1], 48);
    if (!getProfile(profileId)) return apiError(res, 404, "profile_not_found", "找不到该旅人。", "profileId");
    const input = await parseBody(req);
    const name = cleanText(input.name, 24);
    if (!name) return apiError(res, 422, "validation_error", "请填写昵称。", "name");
    const avatar = input.avatar;
    if (avatar !== undefined && (typeof avatar !== "string" || avatar.length > 48000 || (avatar !== "" && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar)))) return apiError(res, 422, "validation_error", "头像格式不正确，请重新选择图片。", "avatar");
    const budget = Number(input.budget);
    if (!Number.isFinite(budget) || budget < 500 || budget > 100000) return apiError(res, 422, "validation_error", "常用预算须在 ¥500–¥100,000 之间。", "budget");
    const pace = allowedPaces.has(input.pace) ? input.pace : null;
    if (!pace) return apiError(res, 422, "validation_error", "请选择一个常用旅行节奏。", "pace");
    const interests = Array.isArray(input.interests)
      ? [...new Set(input.interests.map((interest) => cleanText(interest, 24)).filter(Boolean))].slice(0, 12)
      : [];
    if (!interests.length) return apiError(res, 422, "validation_error", "请至少保留一个旅行兴趣。", "interests");
    return json(res, 200, updateProfile(profileId, { name, avatar, budget: Math.round(budget), pace, interests }));
  }

  const itineraryMatch = pathname.match(/^\/api\/itineraries\/([^/]+)$/);
  if (req.method === "POST" && itineraryMatch) {
    const input = await parseBody(req);
    const name = cleanText(input.name,60);
    if (!["rename","delete","restore"].includes(input.action) || (input.action === "rename" && !name)) return apiError(res,400,"invalid_action","请填写旅程名称");
    // Identity is resolved from the server session, never the submitted profile.
    return manageItinerary(itineraryMatch[1],cleanText(input.profileId,48),input.action,name)
      ? json(res,200,{ok:true}) : apiError(res,404,"not_found","找不到旅程");
  }
  if (req.method === "GET" && itineraryMatch) {
    const identifier = itineraryMatch[1];
    const itinerary = identifier.startsWith("trip-") ? getItineraryById(identifier) : ensureLatestItinerary(identifier);
    return itinerary ? json(res, 200, itinerary) : apiError(res, 404, "itinerary_not_found", "还没有可用行程。", "itineraryId");
  }

  if (req.method === "POST" && pathname === "/api/itinerary/generate") {
    const input = normalizeTripInput(await parseBody(req));
    if (input.error) return apiError(res, 422, "validation_error", input.error[1], input.error[0]);
    const result = buildItinerary(input);
    return json(res, 201, {
      ...result,
      generatedAt: result.itinerary.createdAt,
      source: "sqlite-and-live-input",
      proof: {
        requestPersisted: true,
        itineraryPersisted: true,
        feedbackUsed: result.evidence.feedbackCount,
        liveFeedbackUsed: result.evidence.liveFeedbackCount,
        variablesUsed: ["profileId", "destination", "durationDays", "budget", "partySize", "interests", "pace"]
      }
    });
  }

  const activityMatch = pathname.match(/^\/api\/itinerary\/activities\/([^/]+)$/);
  if (req.method === "POST" && activityMatch) {
    const input = await parseBody(req);
    const profileId = cleanText(input.profileId || "", 48);
    if (!getProfile(profileId)) return apiError(res, 404, "profile_not_found", "找不到该旅人。", "profileId");
    const title = cleanText(input.title, 60);
    const description = cleanText(input.description, 240);
    const time = cleanText(input.time, 32);
    if (title.length < 2) return apiError(res, 422, "validation_error", "这一站的名称至少需要 2 个字符。", "title");
    if (description.length < 4) return apiError(res, 422, "validation_error", "请补充一句这一站的安排说明。", "description");
    if (!/^\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}$/.test(time)) return apiError(res, 422, "validation_error", "时间请使用 09:30 - 11:00 的格式。", "time");
    const itinerary = updateItineraryActivity(profileId, cleanText(activityMatch[1], 80), { title, description, time });
    return itinerary
      ? json(res, 200, { ok: true, itinerary, effect: "修改已写入 SQLite，并同步到导览、漫游和留存。" })
      : apiError(res, 404, "activity_not_found", "在该旅人的当前行程中找不到这一站。", "activityId");
  }

  if (req.method === "POST" && pathname === "/api/itinerary/replan") {
    const input = await parseBody(req);
    const profileId = cleanText(input.profileId || "demo-linmo", 48);
    const profile = getProfile(profileId);
    if (!profile) return apiError(res, 404, "profile_not_found", "找不到该旅人。", "profileId");
    const incident = allowedIncidents.has(input.incident) ? input.incident : "rain";
    const itinerary = input.itineraryId ? getItineraryById(cleanText(input.itineraryId, 80)) : getLatestItinerary(profileId);
    if (!itinerary) return apiError(res, 409, "itinerary_required", "请先生成旅程，再尝试改线。", "itineraryId");
    const requestedDay = Number(input.day || itinerary.dayDetail?.day || 1);
    const selectedDay = itinerary.days.find((day) => Number(day.id) === requestedDay);
    const itineraryForReplan = selectedDay ? {
      ...itinerary,
      dayDetail: {
        day: selectedDay.id,
        title: selectedDay.title,
        totalDistance: selectedDay.distance,
        weather: selectedDay.weather,
        nodes: selectedDay.activityDetails
      }
    } : itinerary;
    const proposal = proposeReplan({
      itinerary: itineraryForReplan,
      incident,
      places: listPlaces(itinerary.destination),
      profile,
      evidence: getPreferenceEvidence(profileId)
    });
    if (!proposal) return apiError(res, 422, "no_replacement", "当前条件下没有合适的替代地点。", "incident");
    return json(res, 201, saveReplan(profileId, proposal));
  }

  if (req.method === "POST" && pathname === "/api/itinerary/accept") {
    const input = await parseBody(req);
    const profileId = cleanText(input.profileId || "demo-linmo", 48);
    const incident = allowedIncidents.has(input.incident) ? input.incident : "rain";
    const proposal = input.replanId
      ? { id: cleanText(input.replanId, 80) }
      : latestProposedReplan(profileId, incident);
    if (!proposal) return apiError(res, 409, "replan_required", "请先生成改线方案。", "replanId");
    const accepted = acceptReplan(proposal.id, profileId);
    return accepted ? json(res, 200, { ok: true, profileId, ...accepted }) : apiError(res, 404, "replan_not_found", "找不到该改线方案。", "replanId");
  }

  if (req.method === "POST" && pathname === "/api/feedback") {
    const input = await parseBody(req);
    const profileId = cleanText(input.profileId || "demo-linmo", 48);
    if (!getProfile(profileId)) return apiError(res, 404, "profile_not_found", "找不到该旅人。", "profileId");
    const activity = cleanText(input.activity || "当前活动", 120);
    const label = cleanText(input.label || input.feedback || "已记录", 40);
    if (!activity || !label) return apiError(res, 422, "validation_error", "活动与反馈内容不能为空。");
    const entry = addFeedback(profileId, activity, label);
    return json(res, 201, {
      ok: true,
      profileId,
      entry,
      feedback: listFeedback(profileId),
      learning: getProfile(profileId).learning,
      effect: "该反馈已写入 SQLite，并会参与下一次生成的排序。"
    });
  }

  const keepsakeMatch = pathname.match(/^\/api\/keepsake\/([^/]+)$/);
  if (req.method === "GET" && keepsakeMatch) {
    const profileId = keepsakeMatch[1];
    if (!getProfile(profileId)) return apiError(res, 404, "profile_not_found", "找不到该旅人。", "profileId");
    const accepted = latestAcceptedReplan(profileId);
    const feedback = listFeedback(profileId);
    const evidence = getPreferenceEvidence(profileId);
    const learned = evidence.topLearnedSignals.map(({ tag }) => tag);
    return json(res, 200, {
      profileId,
      feedback,
      memories: [{
        title: accepted ? "最近一次途中改线" : "路线会保留你的选择",
        body: accepted ? `${accepted.original} → ${accepted.replacement}` : "接受的改线会跨服务重启保存。"
      }],
      nextTime: learned.length ? `下一次优先考虑：${learned.slice(0, 3).join("、")}。` : "完成一次反馈后，系统会把它用于下一次推荐。",
      learning: getProfile(profileId).learning,
      stats: databaseStats(profileId)
    });
  }

  if (req.method === "POST" && pathname === "/api/demo/reset") {
    if (process.env.NODE_ENV === "production") {
      return apiError(res, 403, "reset_disabled", "线上环境不允许清空演示数据。");
    }
    const input = await parseBody(req);
    if (input.confirm !== "RESET_TRIPTUNE_DEMO") return apiError(res, 403, "confirmation_required", "重置演示数据需要确认口令。", "confirm");
    resetLiveDemoData();
    return json(res, 200, { ok: true, message: "已清除现场生成、改线和实时反馈，保留脱敏种子数据。" });
  }

  return apiError(res, 404, "not_found", "找不到该接口。", "path");
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requested).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(frontendDir, normalized);
  if (!filePath.startsWith(frontendDir)) return apiError(res, 403, "forbidden", "无法访问该文件。");
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    if (path.extname(requested) === "") {
      const data = await readFile(path.join(frontendDir, "index.html"));
      res.writeHead(200, { "Content-Type": contentTypes[".html"], "Cache-Control": "no-cache" });
      return res.end(data);
    }
    return apiError(res, 404, "file_not_found", "找不到该文件。");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url.pathname);
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    const status = Number(error.status) || 500;
    const type = error.message === "invalid_json" ? "invalid_json" : error.message === "body_too_large" ? "body_too_large" : "internal_error";
    const message = status === 500 ? "服务暂时无法完成请求，请重试。" : error.message;
    return apiError(res, status, type, message);
  }
});

server.listen(port, host, () => {
  console.log(`TripTune listening on http://${host}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});
