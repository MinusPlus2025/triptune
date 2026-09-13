/* TripTune live client. The API/database is the source of truth; the visual
   export only supplies layout and design tokens. */
(function () {
  "use strict";

  const state = {
    profileId: window.localStorage.getItem("triptune-profile") || "demo-linmo",
    profile: null,
    itinerary: null,
    replan: null,
    replanVersion: 0,
    feedback: [],
    destinations: [],
    destination: null,
    activeDay: 2,
    briefDirty: false
  };

  const interestLibrary = [
    "当代建筑", "独立书店", "深夜爵士", "小众手冲咖啡", "复古黑胶",
    "城市骑行", "街头摄影", "工业遗存", "复古市集", "艺术空间",
    "历史建筑", "地方早餐", "传统工艺", "自然徒步", "夜间散步", "本地社区"
  ];

  // The visual export is a shell. Navigation into itinerary-dependent pages is
  // intentionally disabled until a trip has been generated and persisted.
  window.tripTuneCanNavigate = (viewKey) => {
    if (["02", "03", "04", "05"].includes(String(viewKey)) && !state.itinerary) {
      toast("请先填写目的地，生成一份行程");
      return false;
    }
    return true;
  };

  const API_BASE = String(window.TRIPTUNE_API_BASE || "").replace(/\/$/, "");

  function apiUrl(path) {
    return `${API_BASE}${path}`;
  }

  async function request(path, options) {
    const response = await fetch(apiUrl(path), {
      headers: { "Content-Type": "application/json", ...(options && options.headers) },
      ...options
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error?.message || `API ${response.status}`);
      error.status = response.status;
      error.field = payload?.error?.field;
      throw error;
    }
    return response.json();
  }

  function toast(message) {
    if (typeof window.showToast === "function") window.showToast(message);
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = value == null ? "" : String(value);
    });
  }

  function setI18n(key, value) {
    setText(`[data-i18n="${key}"]`, value);
  }

  function safeNumber(value, fallback) {
    const n = Number(String(value || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : fallback;
  }

  function ensureFormControls() {
    const view = document.getElementById("view-01");
    if (!view) return;
    const textInput = view.querySelector('input[type="text"]');
    if (textInput) {
      textInput.id = "destination";
      textInput.name = "destination";
    }
    const duration = document.getElementById("duration");
    const budget = document.getElementById("briefBudgetSelect");
    const partySize = document.getElementById("partySize");
    if (duration) duration.name = "duration";
    if (budget) budget.name = "budget";
    if (partySize) partySize.name = "partySize";
    view.querySelectorAll('input[type="radio"][name="pace"]').forEach((input, index) => {
      input.value = ["relaxed", "balanced", "dense"][index] || "balanced";
    });
  }

  function showDestinationError(message = "") {
    const input = document.getElementById("destination");
    const error = document.getElementById("destinationError");
    if (!input || !error) return;
    error.textContent = message;
    error.classList.toggle("hidden", !message);
    input.setAttribute("aria-invalid", String(Boolean(message)));
    input.classList.toggle("border-red-400", Boolean(message));
  }

  async function loadDestinations() {
    const destinations = await request("/api/destinations");
    state.destinations = destinations;
    const datalist = document.getElementById("supportedDestinations");
    if (datalist) {
      datalist.innerHTML = "";
      destinations.forEach((city) => {
        const option = document.createElement("option");
        option.value = city.name;
        option.label = `${city.englishName} · ${city.placeCount} 个候选地点`;
        datalist.appendChild(option);
      });
    }
    const input = document.getElementById("destination");
    input?.addEventListener("input", () => showDestinationError());
    return destinations;
  }

  function setupInterestTags() {
    const container = document.getElementById("interestTagsContainer");
    if (!container) return;
    container.querySelectorAll(".interest-tag").forEach((button) => {
      if (!button.hasAttribute("aria-pressed")) {
        button.setAttribute("aria-pressed", button.classList.contains("bg-brand-50") ? "true" : "false");
      }
      button.onclick = () => {
        const active = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("bg-brand-50", active);
        button.classList.toggle("border-brand-200", active);
        button.classList.toggle("text-brand-700", active);
        button.classList.toggle("bg-slate-50", !active);
        button.classList.toggle("border-slate-200", !active);
        button.classList.toggle("text-slate-600", !active);
        state.briefDirty = true;
        updateInterestVisualization();
      };
    });
  }

  function setupPlanningExperience() {
    const page = document.getElementById("view-01");
    if (!page || page.querySelector(".destination-gallery")) return;
    const gallery = document.createElement("div");
    gallery.className = "destination-gallery";
    gallery.setAttribute("aria-label", "选择想去的城市");
    const destination = document.querySelector('input[list="supportedDestinations"]');
    Object.entries(window.tripTuneCityImages || {}).forEach(([city, photo]) => {
      const figure = document.createElement("figure");
      const button = document.createElement("button");
      button.type = "button"; button.dataset.city = city;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = `<img src="${photo.src}" alt="${city}城市风景" loading="lazy"><span>${city}</span><b aria-hidden="true">✓</b>`;
      button.onclick = () => { destination.value = city; destination.dispatchEvent(new Event("input", {bubbles:true})); destination.dispatchEvent(new Event("change", {bubbles:true})); };
      const credit = document.createElement("a"); credit.href = photo.source; credit.target = "_blank"; credit.rel = "noopener";
      credit.textContent = `${photo.author} · ${photo.license}`;
      registerPhotoCredit(photo, city);
      figure.append(button); gallery.appendChild(figure);
    });
    page.children[0].after(gallery);
    const summary = document.createElement("div");
    summary.className = "planning-summary"; summary.setAttribute("aria-live", "polite");
    const side = page.querySelector('[data-purpose="brief-layout"] > div:last-child > div');
    side.prepend(summary);
    const update = () => {
      const city = destination.value.trim();
      gallery.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.city === city)));
      const days = document.getElementById("duration").value;
      const interests = selectedInterestsFromForm();
      summary.replaceChildren();
      const heading = document.createElement("h3"); heading.textContent = city ? `${city}，准备出发` : "这次旅行，由你决定";
      const detail = document.createElement("p"); detail.textContent = `${days} 天 · 预算 ¥${document.getElementById("briefBudgetSelect").value}`;
      const note = document.createElement("p"); note.textContent = interests.length ? `想体验：${interests.join("、")}` : "选几个感兴趣的体验，让安排更合心意。";
      summary.append(heading, detail, note);
    };
    page.addEventListener("input", update); page.addEventListener("change", update); page.addEventListener("click", () => queueMicrotask(update));
    window.refreshPlanningSummary = update;
    update();
  }

  function iconForInterest(value) {
    const text = String(value || "");
    if (/骑行/.test(text)) return "directions_bike";
    if (/摄影/.test(text)) return "photo_camera";
    if (/建筑|工业|城市/.test(text)) return "location_city";
    if (/书|阅读/.test(text)) return "menu_book";
    if (/爵士|音乐|黑胶|夜/.test(text)) return "headphones";
    if (/咖啡|早餐|餐|茶|酒/.test(text)) return "local_cafe";
    if (/自然|徒步|户外/.test(text)) return "landscape";
    if (/市集|工艺/.test(text)) return "storefront";
    if (/艺术|展/.test(text)) return "palette";
    return "explore";
  }

  function selectedInterestsFromForm() {
    return [...document.querySelectorAll("#interestTagsContainer .interest-tag")]
      .filter((button) => button.getAttribute("aria-pressed") === "true")
      .map((button) => button.dataset.interest || button.textContent.trim())
      .filter(Boolean);
  }

  function updateInterestVisualization() {
    const selected = selectedInterestsFromForm();
    setText("#briefTagCount", `${selected.length} 项已选择`);
    setText("#preferenceMatchLabel", selected.length ? `${selected.length} 项兴趣已加入` : "等待选择兴趣");

    const groups = [
      /建筑|空间|工业|设计/,
      /书|阅读|文化|工艺|历史/,
      /爵士|音乐|黑胶|夜/,
      /咖啡|餐|早餐|茶|酒/,
      /自然|徒步|骑行|户外/,
      /摄影|市集|社区|街/ 
    ];
    const groupNames = ["建筑与设计", "人文阅读", "音乐与夜晚", "在地味道", "自然与运动", "街巷与摄影"];
    const scores = groups.map((pattern) => Math.min(1, 0.34 + selected.filter((interest) => pattern.test(interest)).length * 0.24));
    const points = scores.map((score, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 3;
      const radius = 18 + score * 47;
      return [80 + Math.cos(angle) * radius, 80 + Math.sin(angle) * radius];
    });
    const radar = document.querySelector("#view-01 svg");
    const dataPolygon = radar?.querySelectorAll("polygon")?.[3];
    if (dataPolygon) dataPolygon.setAttribute("points", points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "));
    radar?.querySelectorAll("circle").forEach((circle, index) => {
      if (!points[index]) return;
      circle.setAttribute("cx", points[index][0].toFixed(1));
      circle.setAttribute("cy", points[index][1].toFixed(1));
    });
    const ranked = scores.map((score, index) => ({ score, name: groupNames[index] })).sort((a, b) => b.score - a.score);
    setText("#radarSummaryA", selected.length ? `${ranked[0].name} ${Math.round(ranked[0].score * 100)}%` : "等待选择");
    setText("#radarSummaryB", selected.length ? `${ranked[1].name} ${Math.round(ranked[1].score * 100)}%` : "偏好会实时变化");
    ranked.slice(0, 3).forEach((item, index) => {
      const number = index + 1;
      const percent = `${Math.round(item.score * 100)}%`;
      setText(`#calibLabel${number}`, item.name);
      setText(`#calibValue${number}`, percent);
      const bar = document.getElementById(`calibBar${number}`);
      if (bar) bar.style.width = percent;
    });
    updateBriefSummaryPreview();
  }

  function collectBrief() {
    const destination = document.getElementById("destination");
    const duration = document.getElementById("duration");
    const budget = document.getElementById("briefBudgetSelect");
    const partySize = document.getElementById("partySize");
    const interests = selectedInterestsFromForm();
    const pace = document.querySelector('input[name="pace"]:checked');
    return {
      profileId: state.profileId,
      destination: destination?.value?.trim() || "",
      durationDays: safeNumber(duration?.value, 3),
      budget: safeNumber(budget?.value, state.profile?.budget || 5000),
      partySize: partySize?.value || "1人独自探索",
      interests,
      pace: pace?.value || "balanced"
    };
  }

  function updateBriefSummaryPreview(markDirty = false) {
    if (markDirty) state.briefDirty = true;
    const form = collectBrief();
    const paceLabels = { relaxed: "慢慢逛", balanced: "有重点也有休息", dense: "尽量多看少折返" };
    const destination = form.destination || "待填写目的地";
    const interests = form.interests.slice(0, 4).join("、") || "待选择兴趣";
    setText("#calibNote", `准备按「${interests}」生成${destination}${form.durationDays}天行程；预算 ¥${Number(form.budget || 0).toLocaleString("zh-CN")}，${form.partySize} 人，${paceLabels[form.pace] || "当前步调"}。点击生成后会同步到所有页面。`);
  }

  function refreshPaceStyles() {
    document.querySelectorAll('input[name="pace"]').forEach((input) => {
      const label = input.closest("label");
      const active = input.checked;
      label?.classList.toggle("border-2", active);
      label?.classList.toggle("border-brand-600", active);
      label?.classList.toggle("bg-brand-50/60", active);
      label?.classList.toggle("shadow-sm", active);
      label?.classList.toggle("border-slate-200", !active);
      label?.classList.toggle("bg-white", !active);
    });
  }

  function selectOptionByNumber(select, value, formatter = (number) => String(number)) {
    if (!select) return;
    const target = Number(value);
    if (select.tagName === "INPUT") {
      select.value = String(target);
      return;
    }
    const option = [...select.options].find((candidate) => safeNumber(candidate.value, NaN) === target);
    if (option) {
      select.value = option.value;
      return;
    }
    // Keep the visible form faithful even when a generated request uses a value
    // that was not part of Stitch's original demo options.
    const created = document.createElement("option");
    created.value = String(value);
    created.textContent = formatter(value);
    select.appendChild(created);
    select.value = created.value;
  }

  function renderInterestControls(interests, profileInterests = []) {
    const container = document.getElementById("interestTagsContainer");
    if (!container) return;
    const selected = [...new Set((interests || []).filter(Boolean))];
    const fallback = [...new Set((profileInterests || []).filter(Boolean))];
    const pool = [...new Set([...selected, ...fallback, ...interestLibrary])].slice(0, 20);
    container.innerHTML = "";
    document.getElementById("moreInterests")?.remove();
    pool.forEach((interest, index) => {
      const active = selected.includes(interest);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `interest-tag px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${active ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-slate-50 border-slate-200 text-slate-600"}`;
      button.setAttribute("aria-pressed", String(active));
      button.dataset.interest = interest;
      button.hidden = index >= 8 && !active;
      button.dataset.extra = String(index >= 8 && !active);
      if ([...interest].length > 8) button.classList.add("interest-tag-long");
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined text-[14px]";
      icon.textContent = iconForInterest(interest);
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "interest-tag-label";
      label.textContent = interest;
      button.append(icon, label);
      container.appendChild(button);
    });
    if (pool.length > 8) {
      const more = document.createElement("button");
      more.id = "moreInterests"; more.type = "button";
      more.className = "more-interests";
      more.textContent = "更多兴趣"; more.setAttribute("aria-expanded", "false");
      more.onclick = () => {
        const expanded = more.getAttribute("aria-expanded") !== "true";
        container.querySelectorAll('[data-extra="true"]').forEach(button => { button.hidden = !expanded && button.getAttribute("aria-pressed") !== "true"; });
        more.setAttribute("aria-expanded", String(expanded)); more.textContent = expanded ? "收起兴趣" : "更多兴趣";
      };
      container.after(more);
    }
    setupInterestTags();
    updateInterestVisualization();
  }

  function renderBriefFromItinerary(itinerary) {
    if (!itinerary) return;
    const destination = document.getElementById("destination");
    if (destination) destination.value = itinerary.destination || "";
    selectOptionByNumber(document.getElementById("duration"), itinerary.durationDays, (days) => `${days} 天`);
    selectOptionByNumber(document.getElementById("briefBudgetSelect"), itinerary.budget, (budget) => `¥${Number(budget).toLocaleString("zh-CN")}`);
    const partySize = document.getElementById("partySize");
    if (partySize) {
      const target = Number(itinerary.partySize || 1);
      const option = [...partySize.options].find((candidate) => safeNumber(candidate.value, NaN) === target || safeNumber(candidate.textContent, NaN) === target);
      if (option) partySize.value = option.value;
    }
    document.querySelectorAll('input[name="pace"]').forEach((input) => { input.checked = input.value === itinerary.pace; });
    refreshPaceStyles();
    state.briefDirty = false;
    renderInterestControls(itinerary.selectedInterests || [], state.profile?.interests || []);
    ["duration", "partySize"].forEach(id => document.getElementById(id)?.dispatchEvent(new Event("change")));
    updateBriefSummaryPreview();
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.dataset.originalText ||= button.textContent;
    button.textContent = busy ? "正在生成旅程…" : button.dataset.originalText;
    button.classList.toggle("opacity-70", busy);
    button.classList.toggle("cursor-wait", busy);
  }

  function addCustomInterest() {
    const input = document.getElementById("customInterestInput");
    const value = input?.value.trim();
    if (!value) {
      input?.focus();
      return;
    }
    const selected = selectedInterestsFromForm();
    state.briefDirty = true;
    renderInterestControls([...new Set([...selected, value])], state.profile?.interests || []);
    if (input) input.value = "";
    toast(`已加入兴趣：${value}`);
  }

  let windowWeatherCity = "";
  let windowWeatherFetched = 0;
  let windowWeatherSequence = 0;
  async function refreshWindowWeather() {
    // Manually supplied CMA screenshot, not a live observation or API fallback.
    const snapshotViewport = document.getElementById("windowViewport");
    if (!snapshotViewport) return;
    let snapshotBadge = document.getElementById("windowWeatherBadge");
    if (!snapshotBadge) {
      snapshotBadge = document.createElement("div");
      snapshotBadge.id = "windowWeatherBadge";
      snapshotViewport.appendChild(snapshotBadge);
    }
    snapshotViewport.dataset.weather = "unknown";
    snapshotBadge.replaceChildren();
    const snapshotTemp = document.createElement("strong");
    snapshotTemp.textContent = "28.5℃";
    const snapshotCity = document.createElement("span");
    snapshotCity.textContent = "北京 · 9月13日";
    const sun = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sun.setAttribute("viewBox", "0 0 32 32");
    sun.setAttribute("width", "32"); sun.setAttribute("height", "32");
    sun.setAttribute("role", "img"); sun.setAttribute("aria-label", "晴朗");
    sun.style.color = "#b77616";
    sun.innerHTML = '<circle cx="16" cy="16" r="6" fill="#efbb51"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    snapshotBadge.append(sun, snapshotTemp, snapshotCity);
    snapshotBadge.title = "中国气象局天气预报页面截图 · 2026年9月13日12:00 · 非实时数据";
    return;
    // The home-window weather location is Beijing for this presentation.
    // Keep the query and label together; never relabel another city's weather.
    const city = "北京";
    const positions = {"北京":[39.9042,116.4074],"上海":[31.2304,121.4737],"杭州":[30.2741,120.1551],"成都":[30.5728,104.0668],"广州":[23.1291,113.2644],"南京":[32.0603,118.7969]};
    if (city === windowWeatherCity && Date.now() - windowWeatherFetched < 600000) return;
    windowWeatherCity = city; windowWeatherFetched = Date.now();
    const sequence = ++windowWeatherSequence;
    const viewport = document.getElementById("windowViewport");
    let badge = document.getElementById("windowWeatherBadge");
    if (!viewport) return;
    if (!badge) { badge = document.createElement("div"); badge.id = "windowWeatherBadge"; badge.setAttribute("aria-live", "polite"); viewport.appendChild(badge); }
    viewport.dataset.weather = "unknown";
    badge.textContent = city ? `${city} · 查询中` : "先选目的地";
    if (!positions[city]) return;
    try {
      const response = await fetch(`/api/weather/${encodeURIComponent(city)}`, {signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error("weather unavailable");
      const data = (await response.json()).current;
      if (!data || !Number.isFinite(data.temperature_2m) || !Number.isFinite(data.weather_code)) throw new Error("invalid weather");
      if (sequence !== windowWeatherSequence) return;
      const code = data.weather_code;
      const kind = code === 0 ? "sun" : code <= 3 ? "cloud" : code >= 71 && code <= 77 || code === 85 || code === 86 ? "snow" : code >= 51 ? "rain" : "fog";
      viewport.dataset.weather = kind;
      viewport.dataset.weatherNight = String(!data.is_day);
      const icons = {sun:data.is_day ? "sunny" : "dark_mode",cloud:"cloud",rain:"rainy",snow:"weather_snowy",fog:"foggy"};
      const labels = {sun:"晴",cloud:"多云",rain:"雨",snow:"雪",fog:"雾"};
      badge.replaceChildren();
      const icon = document.createElement("span"); icon.className = "material-symbols-outlined"; icon.textContent = icons[kind]; icon.setAttribute("aria-hidden","true");
      const temperature = document.createElement("strong"); temperature.textContent = `${Math.round(data.temperature_2m)}°`;
      const label = document.createElement("span"); label.textContent = `${city} · ${labels[kind]}`;
      badge.append(icon,temperature,label);
      badge.title = `${data.time} 更新 · °C`;
      document.getElementById("skyDayBg").style.opacity = data.is_day ? "1" : "0";
      document.getElementById("skyNightBg").style.opacity = data.is_day ? "0" : "1";
    } catch {
      if (sequence !== windowWeatherSequence) return;
      badge.textContent = `${city} · 天气暂不可用`;
      windowWeatherFetched = Date.now() - 540000;
    }
  }
  function setAutomaticSky() {
    const hour = new Date().getHours();
    const night = hour < 6 || hour >= 19;
    const day = document.getElementById("skyDayBg");
    const nightSky = document.getElementById("skyNightBg");
    const glass = document.getElementById("windowGlassOverlay");
    day?.classList.toggle("opacity-0", night);
    day?.classList.toggle("opacity-100", !night);
    nightSky?.classList.toggle("opacity-100", night);
    nightSky?.classList.toggle("opacity-0", !night);
    glass?.classList.toggle("text-amber-100", night);
    glass?.classList.toggle("text-slate-800", !night);
  }

  function renderBoardingWindow() {
    const destinationInput = document.getElementById("destination")?.value.trim();
    const city = state.destination || state.destinations.find((item) => {
      const names = [item.name, item.englishName, item.code, ...(item.aliases || [])].map((name) => String(name).toLowerCase());
      return names.includes(String(destinationInput || "").toLowerCase());
    });
    const isEnglish = document.documentElement.lang === "en";
    const pendingDestination = isEnglish ? "Pending" : "待定";
    const destination = state.itinerary?.destination || city?.name || destinationInput || pendingDestination;
    const destinationCode = city?.code || (state.itinerary ? state.itinerary.destination : "---");
    const flightCode = state.itinerary ? `TT-${String(state.itinerary.id).slice(-4).toUpperCase()}` : (isEnglish ? "TT-PENDING" : "TT-待生成");
    const seat = state.profileId === "demo-zhouye" ? "12F" : "18A";
    const status = state.itinerary ? (isEnglish ? "Trip synced" : "行程已同步") : (isEnglish ? "Ready to plan" : "等待生成");
    const locale = isEnglish ? "en-US" : "zh-CN";
    const now = new Date();
    const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(now);
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

    setText("#windowOriginCode", "HOME");
    setText("#boardingOriginCode", "HOME");
    setText("#boardingDestinationCode", destinationCode);
    setText("#windowSeat", seat);
    setText("#windowFlight", flightCode);
    setText("#windowDate", date);
    setText("#windowTripStatus", status);
    setText("#tripStatusTop", isEnglish ? `TRIP STATUS: ${state.itinerary ? "READY" : "READY TO PLAN"}` : `行程状态：${status}`);
    setText("#localTimeTop", isEnglish ? `LOCAL TIME: ${time}` : `本地时间：${time}`);
    setText("#boardingStatusLabel", state.itinerary
      ? (isEnglish ? `${destination} · ${state.itinerary.durationDays}-day trip ready` : `${destination} · ${state.itinerary.durationDays} 天行程已准备`)
      : (isEnglish ? "Complete your preferences to build a real route" : "填写偏好后生成真实路线"));
    setText("#flightRouteLabel", destination === pendingDestination ? (isEnglish ? "Choose a destination" : "选择目的地") : destination);
    setText("#flightStatusLabel", `${state.profile?.name || (isEnglish ? "Traveler" : "用户")} · ${destination === pendingDestination ? (isEnglish ? "DESTINATION PENDING" : "等待目的地") : destination} · ${status}`);
    setText("#boardingFlightCode", flightCode);
    setText("#boardingIssuedDate", date);
    setText("#windowDestinationLabel", `${isEnglish ? "Beijing" : "北京"} · ${date}`);
    setText("#boardingSeatGate", `${seat} / ${destinationCode}`);
    const detailLabels = document.querySelectorAll("#windowGlassOverlay > .grid > div > div > span:first-child");
    const labels = isEnglish ? ["SEAT", "FLIGHT", "DATE", "STATUS"] : ["座位", "航班", "日期", "状态"];
    detailLabels.forEach((label, index) => { if (labels[index]) label.textContent = labels[index]; });
    setAutomaticSky();
    refreshWindowWeather();
  }

  function setupWindowExperience() {
    const viewport = document.getElementById("windowViewport");
    const daySky = document.getElementById("skyDayBg");
    const shade = document.getElementById("windowShade");
    const overlay = document.getElementById("windowGlassOverlay");
    if (!viewport || !daySky || !shade || !overlay) return;
    const destinationLabel = document.createElement("div");
    destinationLabel.id = "windowDestinationLabel";
    destinationLabel.hidden = true;
    destinationLabel.style.display = "none";
    destinationLabel.className = "window-destination";
    viewport.appendChild(destinationLabel);

    if (!viewport.querySelector(".window-plane")) {
      ["cloud-a", "cloud-b", "cloud-c"].forEach((className) => {
        const cloud = document.createElement("span");
        cloud.className = `window-cloud ${className}`;
        cloud.setAttribute("aria-hidden", "true");
        daySky.appendChild(cloud);
      });
      const plane = document.createElement("span");
      plane.className = "material-symbols-outlined window-plane";
      plane.textContent = "flight";
      plane.setAttribute("aria-hidden", "true");
      viewport.insertBefore(plane, shade);
    }

    const routeRow = overlay.children[0];
    const detailGrid = overlay.children[2];
    const routeColumns = routeRow?.querySelectorAll(":scope > div");
    if (routeColumns?.[0]) routeColumns[0].querySelector("span:last-child")?.setAttribute("id", "windowOriginCode");
    const details = detailGrid?.querySelectorAll(":scope > div > div");
    const fieldIds = ["windowSeat", "windowFlight", "windowDate", "windowTripStatus"];
    const labels = document.documentElement.lang === "en" ? ["SEAT", "FLIGHT", "DATE", "STATUS"] : ["座位", "航班", "日期", "状态"];
    details?.forEach((detail, index) => {
      detail.querySelector("span:first-child").textContent = labels[index];
      detail.querySelector("span:last-child")?.setAttribute("id", fieldIds[index]);
    });

    // Procedural mechanical sounds: friction, a damped latch, and a soft release.
    let audioContext;
    let audioSource;
    const tones = new Set();
    const sound = {
      pause() { try { audioSource?.stop(); } catch {} audioSource = null; tones.forEach(tone => { try { tone.stop(); } catch {} }); tones.clear(); },
      settle(closed) {
        if (!audioContext || muted || document.hidden) return;
        const now = audioContext.currentTime;
        {
          const tone = audioContext.createBufferSource();
          const envelope = audioContext.createGain();
          const start = now;
          const duration = closed ? 0.13 : 0.2;
          const buffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * duration), audioContext.sampleRate);
          const samples = buffer.getChannelData(0);
          let smooth = 0;
          for (let i = 0; i < samples.length; i++) {
            const t = i / audioContext.sampleRate;
            smooth = smooth * 0.85 + (Math.random() * 2 - 1) * 0.15;
            samples[i] = closed
              ? (smooth * 0.5 + Math.sin(2 * Math.PI * 95 * t) * 0.3) * Math.exp(-t * 48) * Math.min(1, t * 1000)
              : smooth * Math.sin(Math.PI * t / duration) * Math.exp(-t * 9);
          }
          tone.buffer = buffer;
          envelope.gain.value = closed ? 0.12 : 0.09;
          tone.connect(envelope).connect(audioContext.destination);
          tones.add(tone);
          tone.onended = () => { tones.delete(tone); tone.disconnect(); envelope.disconnect(); };
          tone.start(start); tone.stop(start + duration);
        }
      },
      async play() {
        const AudioEngine = window.AudioContext || window.webkitAudioContext;
        if (!AudioEngine) return;
        audioContext ||= new AudioEngine();
        this.pause();
        await audioContext.resume();
        if (muted || document.hidden) return;
        const length = Math.floor(audioContext.sampleRate * 0.35);
        const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / length);
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 420;
        filter.Q.value = 0.6;
        const gain = audioContext.createGain();
        gain.gain.value = 0.035;
        source.buffer = buffer;
        source.connect(filter).connect(gain).connect(audioContext.destination);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
        audioSource = source;
        source.start();
      }
    };
    let muted = window.localStorage.getItem("triptune-window-muted") === "true";
    const muteButton = document.createElement("button");
    muteButton.type = "button";
    muteButton.className = "text-xs text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100";
    const syncMute = () => {
      muteButton.textContent = muted ? "舷窗音效：关" : "舷窗音效：开";
      muteButton.setAttribute("aria-pressed", String(!muted));
    };
    muteButton.onclick = () => { muted = !muted; sound.pause(); window.localStorage.setItem("triptune-window-muted", String(muted)); syncMute(); };
    syncMute();
    document.getElementById("planeWindowOuter").after(muteButton);
    const weatherSource = document.createElement("a");
    weatherSource.href = "https://open-meteo.com/"; weatherSource.target = "_blank"; weatherSource.rel = "noopener";
    weatherSource.textContent = "Open-Meteo";
    weatherSource.className = "text-xs text-slate-500 underline";
    const credits = document.createElement("details");
    credits.className = "mt-6 text-xs text-slate-500";
    const summary = document.createElement("summary");
    summary.textContent = "数据来源";
    summary.className = "cursor-pointer py-3";
    credits.append(summary, weatherSource);
    document.getElementById("view-06")?.appendChild(credits);
    const playShade = () => {
      if (muted || document.hidden) return;
      sound.play().catch(() => {});
    };
    const observer = new IntersectionObserver(([entry]) => {
      viewport.classList.toggle("window-paused", !entry.isIntersecting);
      if (!entry.isIntersecting) sound.pause();
    });
    observer.observe(viewport);
    document.addEventListener("visibilitychange", () => {
      viewport.classList.toggle("window-paused", document.hidden);
      if (document.hidden) sound.pause();
    });
    let currentPercent = 12;
    const shadeTrack = document.createElement("div");
    shadeTrack.className = "window-shade-track";
    shade.before(shadeTrack);
    shadeTrack.appendChild(shade);
    const grip = shade.firstElementChild;
    if (grip) {
      grip.id = "windowShadeGrip";
      grip.setAttribute("role", "slider");
      grip.setAttribute("tabindex", "0");
      grip.setAttribute("aria-label", "拖动舷窗遮光板");
      grip.setAttribute("aria-valuemin", "12");
      grip.setAttribute("aria-valuemax", "92");
    }
    let startY = 0;
    let startPercent = 12;
    let moved = false;
    const setPercent = (percent) => {
      const next = Math.max(12, Math.min(92, percent));
      currentPercent = next;
      shadeTrack.classList.toggle("is-sealed", next >= 91);
      const closure = (next - 12) / 80;
      document.documentElement.style.setProperty("--cabin-closed", `${closure * 100}%`);
      document.documentElement.style.setProperty("--cabin-frame-light", String(1 - closure * 0.48));
      shade.style.transform = `translateY(${(next - 92) * 0.7125}%)`;
      grip?.setAttribute("aria-valuenow", String(Math.round(next)));
      grip?.setAttribute("aria-valuetext", next > 85 ? "遮光板已关闭" : next < 20 ? "遮光板已打开" : "遮光板部分打开");
    };
    const beginDrag = (event) => {
      startY = event.clientY;
      startPercent = currentPercent;
      moved = false;
      shade.style.transition = "none";
      document.documentElement.classList.add("cabin-dragging");
      playShade();
      shade.setPointerCapture?.(event.pointerId);
    };
    const moveDrag = (event) => {
      if (!shade.hasPointerCapture?.(event.pointerId)) return;
      const delta = (event.clientY - startY) / viewport.getBoundingClientRect().height * 100;
      if (Math.abs(delta) > 1) moved = true;
      setPercent(startPercent + delta);
    };
    const endDrag = (event) => {
      if (!shade.hasPointerCapture?.(event.pointerId)) return;
      shade.releasePointerCapture(event.pointerId);
      document.documentElement.classList.remove("cabin-dragging");
      shade.style.transition = "transform 520ms cubic-bezier(0.16, 1, 0.3, 1)";
      setPercent(moved ? (currentPercent > 52 ? 92 : 12) : (currentPercent > 52 ? 12 : 92));
      sound.settle(currentPercent > 52);
    };
    shade.addEventListener("pointerdown", beginDrag);
    shade.addEventListener("pointermove", moveDrag);
    shade.addEventListener("pointerup", endDrag);
    shade.addEventListener("pointercancel", endDrag);
    grip?.addEventListener("keydown", (event) => {
      const current = currentPercent;
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) playShade();
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPercent(current > 52 ? 12 : 92); }
      if (event.key === "ArrowDown") { event.preventDefault(); setPercent(current + 8); }
      if (event.key === "ArrowUp") { event.preventDefault(); setPercent(current - 8); }
      if (event.key === "Home") { event.preventDefault(); setPercent(12); }
      if (event.key === "End") { event.preventDefault(); setPercent(92); }
      if (["Home", "End", "Enter", " "].includes(event.key)) sound.settle(currentPercent > 52);
    });
    setPercent(12);
    renderBoardingWindow();
    window.setInterval(renderBoardingWindow, 60_000);
  }

  function renderProfile(profile) {
    if (!profile) return;
    state.profile = profile;
    setText("#travelerNameDisplay", profile.name);
    renderAvatar(document.getElementById("travelerAvatar"), profile.avatar, profile.name);
    setText(".traveler-dynamic-name", profile.name);
    setText("#tuningSummaryText", profile.signals || `旅行偏好：${(profile.interests || []).slice(0, 3).join(" / ")}`);
    setText("#briefTagCount", `${profile.interests?.length || 0} TAGS AVAILABLE`);
    setText("#calibNote", `本次生成会使用「${(profile.interests || []).slice(0, 3).join("、") || "当前兴趣"}」、预算、节奏与历史反馈共同排序。`);
    const budget = document.getElementById("briefBudgetSelect");
    if (budget && !state.itinerary) {
      budget.value = String(Number(profile.budget || 5000));
    }
    if (!state.itinerary) renderInterestControls((profile.interests || []).slice(0, 3), profile.interests || []);
    renderBoardingWindow();
  }

  let pendingAvatar;
  function renderAvatar(node, avatar, name) {
    if (!node) return;
    node.replaceChildren();
    if (/^data:image\/jpeg;base64,/.test(avatar || "")) {
      const img = document.createElement("img");
      img.src = avatar; img.alt = `${name || "用户"}的头像`;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%";
      node.append(img);
    } else node.textContent = (name || "我").slice(0, 1);
  }
  async function chooseProfileAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;
    const error = document.getElementById("profileEditorError");
    const save = document.getElementById("saveProfileEditor");
    save.disabled = true;
    let bitmap;
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("请选择不超过 5 MB 的 JPG、PNG 或 WebP 图片。");
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 160, 160);
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, 160, 160);
      pendingAvatar = canvas.toDataURL("image/jpeg", 0.75);
      if (pendingAvatar.length > 48000) throw new Error("图片压缩失败，请换一张图片。");
      renderAvatar(document.getElementById("profileAvatarPreview"), pendingAvatar, state.profile.name);
      error.classList.add("hidden");
    } catch (failure) { error.textContent = failure.message; error.classList.remove("hidden"); }
    finally { bitmap?.close(); save.disabled = false; event.target.value = ""; }
  }
  function openProfileEditor() {
    const dialog = document.getElementById("profileEditor");
    if (!dialog || !state.profile) return;
    if (dialog.open) return;
    pendingAvatar = undefined;
    document.getElementById("profileAvatarFile").value = "";
    renderAvatar(document.getElementById("profileAvatarPreview"), state.profile.avatar, state.profile.name);
    document.getElementById("profileName").value = state.profile.name || "";
    document.getElementById("profileBudget").value = state.profile.budget || 5000;
    document.getElementById("profilePace").value = state.profile.pace || "balanced";
    document.getElementById("profileInterests").value = (state.profile.interests || []).join("、");
    document.getElementById("profileEditorError")?.classList.add("hidden");
    dialog.showModal();
    requestAnimationFrame(() => dialog.classList.add("is-open"));
    document.getElementById("profileName")?.focus();
  }

  function openActivityEditor(activity) {
    const dialog = document.getElementById("activityEditor");
    if (!dialog || !activity || dialog.open) return;
    document.getElementById("activityEditorId").value = activity.id || "";
    document.getElementById("activityEditorName").value = activity.title || "";
    document.getElementById("activityEditorTime").value = activity.time || "";
    document.getElementById("activityEditorDescription").value = activity.desc || "";
    setText("#activityEditorDay", `DAY ${String(state.activeDay || 1).padStart(2, "0")} · ${state.itinerary?.destination || "当前城市"}`);
    document.getElementById("activityEditorError")?.classList.add("hidden");
    dialog.showModal();
    requestAnimationFrame(() => dialog.classList.add("is-open"));
    document.getElementById("activityEditorName")?.focus();
  }

  function closeActivityEditor() {
    const dialog = document.getElementById("activityEditor");
    if (!dialog?.open) return;
    dialog.classList.remove("is-open");
    dialog.classList.add("is-closing");
    const closeMs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--modal-close-dur")) || 150;
    window.setTimeout(() => {
      dialog.classList.remove("is-closing");
      dialog.close();
    }, closeMs);
  }

  async function saveActivity(event) {
    event.preventDefault();
    const activityId = document.getElementById("activityEditorId").value;
    const button = document.getElementById("saveActivityEditor");
    const errorNode = document.getElementById("activityEditorError");
    const activeDay = state.activeDay;
    button.disabled = true;
    button.dataset.originalText ||= button.textContent;
    button.textContent = "正在同步…";
    try {
      const result = await request(`/api/itinerary/activities/${encodeURIComponent(activityId)}`, {
        method: "POST",
        body: JSON.stringify({
          profileId: state.profileId,
          title: document.getElementById("activityEditorName").value.trim(),
          time: document.getElementById("activityEditorTime").value.trim(),
          description: document.getElementById("activityEditorDescription").value.trim()
        })
      });
      renderItinerary(result.itinerary);
      closeActivityEditor();
      openItineraryDay(activeDay);
      toast("这一站已保存，并同步到整段旅程");
    } catch (error) {
      if (errorNode) {
        errorNode.textContent = error.message || "保存失败，请检查内容后重试。";
        errorNode.classList.remove("hidden");
      }
    } finally {
      button.disabled = false;
      button.textContent = button.dataset.originalText;
    }
  }

  function closeProfileEditor() {
    const dialog = document.getElementById("profileEditor");
    if (!dialog?.open) return;
    dialog.classList.remove("is-open");
    dialog.classList.add("is-closing");
    const closeMs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--modal-close-dur")) || 150;
    window.setTimeout(() => {
      dialog.classList.remove("is-closing");
      dialog.close();
    }, closeMs);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const button = document.getElementById("saveProfileEditor");
    const errorNode = document.getElementById("profileEditorError");
    const interests = document.getElementById("profileInterests").value
      .split(/[、,，\n]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);
    const payload = {
      name: document.getElementById("profileName").value.trim(),
      avatar: pendingAvatar,
      budget: safeNumber(document.getElementById("profileBudget").value, 0),
      pace: document.getElementById("profilePace").value,
      interests
    };
    button.disabled = true;
    button.dataset.originalText ||= button.textContent;
    button.textContent = "正在保存…";
    try {
      const profile = await request(`/api/profiles/${state.profileId}`, { method: "POST", body: JSON.stringify(payload) });
      renderProfile(profile);
      renderInterestControls(profile.interests.slice(0, 3), profile.interests);
      selectOptionByNumber(document.getElementById("briefBudgetSelect"), profile.budget, (budget) => `¥${Number(budget).toLocaleString("zh-CN")}`);
      document.querySelectorAll('input[name="pace"]').forEach((input) => { input.checked = input.value === profile.pace; });
      closeProfileEditor();
      if (!document.getElementById("view-06")?.classList.contains("hidden")) await renderPersonalPage();
      toast("个人偏好已保存，将用于下一次旅程生成");
    } catch (error) {
      if (errorNode) {
        errorNode.textContent = error.message || "保存失败，请检查输入后重试。";
        errorNode.classList.remove("hidden");
      }
    } finally {
      button.disabled = false;
      button.textContent = button.dataset.originalText;
    }
  }

  function editTripField(fieldId) {
    window.switchView("01");
    window.setTimeout(() => {
      const target = document.getElementById(fieldId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
  }

  function patchEditableSurfaces() {
    const mappings = [
      ["#metricTransitValue", "duration", "修改旅行天数后重新安排交通"],
      ["#metricStayValue", "destination", "修改目的地（这里是住宿区域建议，不提供酒店预订）"],
      ["#metricBudgetValue", "briefBudgetSelect", "修改旅行预算"],
      ["#metricRadiusValue", "customInterestInput", "修改兴趣后重新安排探索范围"]
    ];
    mappings.forEach(([selector, fieldId, label]) => {
      const surface = document.querySelector(selector)?.closest("[data-purpose='overview-metrics'] > div");
      if (!surface) return;
      surface.classList.add("editable-surface");
      surface.setAttribute("role", "button");
      surface.setAttribute("tabindex", "0");
      surface.setAttribute("title", label);
      surface.setAttribute("aria-label", label);
      const hint = document.createElement("div");
      hint.className = "text-xs text-brand-700 mt-2";
      hint.textContent = "修改出发需求 →";
      surface.appendChild(hint);
      surface.onclick = () => editTripField(fieldId);
      surface.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          editTripField(fieldId);
        }
      };
    });
    document.querySelectorAll("[data-purpose='preference-metrics'] > div").forEach((surface) => {
      surface.classList.add("editable-surface");
      surface.setAttribute("role", "button");
      surface.setAttribute("tabindex", "0");
      surface.setAttribute("title", "编辑我的旅行偏好");
      surface.onclick = openProfileEditor;
      surface.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProfileEditor(); }
      };
    });
    document.querySelectorAll("#view-00 .traveler-dynamic-name, #view-00 #tuningSummaryText").forEach((surface) => {
      surface.classList.add("editable-surface", "rounded");
      surface.setAttribute("role", "button");
      surface.setAttribute("tabindex", "0");
      surface.setAttribute("title", "编辑我的旅行偏好");
      surface.onclick = openProfileEditor;
      surface.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openProfileEditor(); }
      };
    });
  }

  function exportTripArchive() {
    if (!state.itinerary) {
      toast("请先生成旅程，再导出旅程档案");
      return;
    }
    const trip = state.itinerary;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    const ctx = canvas.getContext("2d");
    if (!ctx) { toast("当前浏览器暂不支持图片导出"); return; }
    const lines = [];
    const wrap = (text, size, color, gap = 16) => {
      ctx.font = `${size}px sans-serif`;
      let line = "";
      for (const char of String(text || "")) {
        if (char === "\n" || ctx.measureText(line + char).width > 1020) {
          lines.push({text:line,size,color,gap:8}); line = char === "\n" ? "" : char;
        } else line += char;
      }
      lines.push({text:line,size,color,gap});
    };
    wrap("TripTune",64,"#234944",20);
    wrap(`${trip.destination} · ${trip.durationDays}天旅程`,48,"#234944",16);
    wrap("为你量身定制的旅程",28,"#ad603f",32);
    for (const [index,day] of (trip.days || []).entries()) {
      wrap(`第${index+1}天 · ${day.title || "当天安排"}`,34,"#ad603f",14);
      wrap(day.description || day.desc || "",26,"#50635e",16);
      for (const activity of day.activityDetails || day.activities || []) {
        wrap(typeof activity === "string" ? `— ${activity}` : `${activity.time || ""}  ${activity.title || activity.name || ""}`,28,"#234944",14);
      }
      wrap("",16,"#234944",24);
    }
    wrap("旅行计划 · 不代表实际到访记录",22,"#50635e",10);
    canvas.height = Math.ceil(160 + lines.reduce((height,line) => height + line.size * 1.4 + line.gap,0));
    ctx.fillStyle = "#fffaf0"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#ad603f"; ctx.fillRect(80,40,100,6);
    let y = 90;
    ctx.textBaseline = "top";
    for (const line of lines) {
      ctx.font = `${line.size}px sans-serif`; ctx.fillStyle = line.color;
      ctx.fillText(line.text,90,y); y += line.size * 1.4 + line.gap;
    }
    canvas.toBlob(blob => {
      if (!blob) { toast("图片生成失败，请重试"); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url;
      link.download = `TripTune-${trip.destination}-旅程.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      toast("旅程图片已生成");
    },"image/png");
  }

  function renderProof(payload) {
    const itinerary = payload?.itinerary || state.itinerary;
    const proof = payload?.proof;
    if (!itinerary) return;
    let panel = document.getElementById("dataProofPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "dataProofPanel";
      panel.className = "rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-xs text-slate-700";
      panel.setAttribute("aria-live", "polite");
      const overview = document.getElementById("view-02");
      const metrics = overview?.querySelector('[data-purpose="overview-metrics"]');
      if (metrics) metrics.insertAdjacentElement("afterend", panel);
    }
    const selected = itinerary.selectedInterests?.join("、") || "当前兴趣";
    const feedbackCount = proof?.feedbackUsed ?? itinerary.explanation?.feedbackEvidenceCount ?? 0;
    panel.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <strong class="text-brand-800">这次旅行，按你的想法安排</strong>
        <span class="text-xs text-brand-700">行程已保存</span>
      </div>
        <p class="mt-1.5 leading-relaxed">${itinerary.destination} · ${itinerary.durationDays} 天 · ${itinerary.partySize} 人同行，预算 ¥${Number(itinerary.budget || 0).toLocaleString("zh-CN")}。围绕「${selected}」安排，也参考了你之前的 ${feedbackCount} 条反馈。想换个节奏？可以随时调整。</p>
    `;
  }

  function createCityCover(destination) {
    const photo = window.tripTuneCityImages?.[destination];
    return createPhotoCover(photo, `${destination}城市风景（非当天景点照片）`, `${destination}城市风景`);
  }

  function createPlaceCover(activity) {
    const key = `${state.itinerary?.destination || ""}|${activity?.title || ""}`;
    const photo = window.tripTunePlaceImages?.[key];
    return createPhotoCover(photo, photo?.caption, photo?.caption);
  }

  function registerPhotoCredit(photo, label) {
    const page = document.getElementById("view-06");
    if (!page || !photo?.source) return;
    let details = document.getElementById("photoAcknowledgements");
    if (!details) {
      details = document.createElement("details");
      details.id = "photoAcknowledgements";
      details.className = "mt-6 text-xs text-slate-500";
      const summary = document.createElement("summary");
      summary.textContent = "图片致谢";
      details.appendChild(summary);
      page.appendChild(details);
    }
    if ([...details.querySelectorAll("a")].some(a => a.getAttribute("href") === photo.source)) return;
    const link = document.createElement("a");
    link.href = photo.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${label || "图片"} · ${photo.author} · ${photo.license}（已裁切）`;
    const item = document.createElement("p");
    item.appendChild(link); details.appendChild(item);
  }

  function createPhotoCover(photo, alt, label) {
    if (!photo) return null;
    const figure = document.createElement("figure");
    figure.className = "city-cover";
    // Reveal only a successfully loaded image. Failed assets never reserve space.
    figure.hidden = true;
    const img = document.createElement("img");
    img.alt = alt;
    img.decoding = "async";
    img.onload = () => { figure.hidden = false; };
    img.onerror = () => { figure.remove(); };
    const caption = document.createElement("figcaption");
    caption.append(`${label} · `);
    const credit = document.createElement("a");
    credit.href = photo.source;
    credit.target = "_blank";
    credit.rel = "noopener noreferrer";
    credit.textContent = `${photo.author} · ${photo.license}`;
    credit.title = "照片来源与许可（封面已裁切）";
    credit.onclick = (event) => event.stopPropagation();
    credit.onkeydown = (event) => event.stopPropagation();
    caption.append(credit);
    registerPhotoCredit(photo, label);
    figure.append(img);
    img.src = photo.src;
    return figure;
  }

  function renderOverview(itinerary) {
    if (!itinerary) return;
    const days = itinerary.days || [];
    const primary = document.querySelector('#view-02 [data-purpose="overview-primary"]');
    if (primary) {
      document.getElementById("tripDayNavigation")?.remove();
      const dayNavigation = document.createElement("nav");
      dayNavigation.id = "tripDayNavigation";
      dayNavigation.className = "trip-day-navigation";
      dayNavigation.setAttribute("aria-label", "选择要查看的旅行日期");
      days.forEach(day => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `第 ${day.id} 天`;
        if (Number(day.id) === Number(state.activeDay)) button.setAttribute("aria-current", "true");
        button.onclick = () => openItineraryDay(day.id);
        dayNavigation.appendChild(button);
      });
      primary.parentElement.before(dayNavigation);
      primary.innerHTML = "";
      days.forEach((day, index) => {
        const isActive = Number(day.id) === Number(state.activeDay);
        const card = document.createElement("article");
        card.className = `api-day-card editable-surface bg-white rounded-xl border ${isActive ? "border-2 border-brand-600 shadow-md" : "thin-border shadow-sm"} overflow-hidden transition`;
        card.dataset.dayCard = String(day.id);
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `打开第 ${day.id} 天：${day.title || "当天行程"}`);
        card.onclick = () => openItineraryDay(day.id);
        card.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openItineraryDay(day.id);
          }
        };
        const body = document.createElement("div");
        body.className = "p-4";
        const top = document.createElement("div");
        top.className = "flex items-center justify-between gap-3";
        const badge = document.createElement("span");
        badge.className = `text-[10px] font-mono font-bold ${isActive ? "text-brand-700 bg-brand-50" : "text-slate-600 bg-slate-100"} px-2 py-0.5 rounded`;
        badge.textContent = `DAY ${String(day.id).padStart(2, "0")}`;
        const firstActivity = day.activityDetails?.[0];
        const meta = document.createElement("span");
        meta.className = "text-[11px] text-slate-500 font-mono text-right";
        meta.textContent = firstActivity ? `${firstActivity.time} · ${firstActivity.meta}` : "按当前路线计算";
        top.append(badge, meta);
        const title = document.createElement("h4");
        title.className = "text-base font-bold text-slate-900 mt-3";
        title.textContent = day.title || `第 ${day.id} 天`;
        const desc = document.createElement("p");
        desc.className = "text-xs text-slate-500 mt-1 leading-relaxed";
        desc.textContent = day.desc || "根据本次输入生成当天安排。";
        const footer = document.createElement("div");
        footer.className = "mt-4 pt-3 border-t thin-border flex items-center justify-between gap-3 text-[11px] font-mono";
        const activities = document.createElement("span");
        activities.className = "text-brand-700 min-w-0";
        activities.textContent = (day.activities || []).join(" → ") || "本日暂无活动";
        const weather = document.createElement("span");
        weather.className = "text-emerald-600 text-right shrink-0";
        weather.textContent = day.weather || "按当天路线更新";
        footer.append(activities, weather);
        body.append(top, title, desc, footer);
        const cover = createPlaceCover(firstActivity);
        if (cover) card.appendChild(cover);
        card.appendChild(body);
        primary.appendChild(card);
      });
    }
    const profile = state.profile;
    const city = state.destination || state.destinations.find((item) => item.name === itinerary.destination);
    const issued = itinerary.createdAt ? new Date(itinerary.createdAt) : new Date();
    const issuedLabel = Number.isNaN(issued.getTime()) ? "已生成" : issued.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
    const flightCode = `TT-${String(itinerary.id || "LIVE").slice(-4).toUpperCase()}`;
    setText("#boardingFlightCode", flightCode);
    setText("#boardingIssuedDate", issuedLabel);
    setText("#boardingSeatGate", `18A / ${city?.code || "LIVE"}`);
    setText("#metricTransitValue", city?.transport || "公共交通 / 步行");
    setText("#metricTransitSubValue", `${itinerary.days?.length || 0} 天按区域组合`);
    setText("#metricStayValue", city?.stay || `${itinerary.destination}中心区域连住`);
    setText("#metricStaySubValue", "减少住宿迁移与折返");
    setText("#metricRadiusValue", city?.radius || "多街区组合");
    setText("#metricRadiusSubValue", `来自 ${city?.placeCount || "城市"} 个候选地点`);
    setText("#flightRouteLabel", itinerary.destination);
    setText("#flightStatusLabel", `${itinerary.destination} · ${itinerary.durationDays}天旅程`);
    setText("#waypointValue", `${city?.code || itinerary.destination} · LIVE`);
    setText("#boardingDestinationCode", city?.code || itinerary.destination);
    setText("#boardingOriginCode", "BASE");
    setText("#goldenHourOverview", `${itinerary.destination} · 按当日地点开放与光线安排`);
    const spent = Number(itinerary.estimatedCost || 0);
    const budget = Number(itinerary.budget || profile?.budget || 0);
    setText("#metricBudgetValue", `¥${spent.toLocaleString("zh-CN")} / ¥${budget.toLocaleString("zh-CN")}`);
    setText("#metricBudgetSubValue", budget ? `预计使用 ${(spent / budget * 100).toFixed(1)}%` : "按本次预算计算");
    if (profile) {
      const selectedInterests = itinerary.selectedInterests || [];
      const paceLabels = { relaxed: "松弛漫步", balanced: "平衡探索", dense: "充实饱满" };
      setI18n("overviewHeader", `${itinerary.destination || "城市"} · ${days.length || 3}天旅程`);
      setI18n("overviewSub", "先看完整旅程，再决定今天从哪里开始");
      setI18n("whyFitsTitle", "为什么适合你");
      setI18n("whyPoint1Title", "按你的兴趣选择主线");
      setI18n("whyPoint1Body", `${selectedInterests.slice(0, 3).join("、") || "你的偏好"} 被优先安排在核心时段。`);
      setI18n("whyPoint2Title", "按你的节奏控制移动");
      setI18n("whyPoint2Body", `采用${paceLabels[itinerary.pace] || itinerary.pace}，总步行约 ${itinerary.dayDetail?.totalDistance || "按路线计算"}，并保留可调整的缓冲时间。`);
    }
    const activeDay = days.find((day) => Number(day.id) === Number(state.activeDay)) || days[0];
    setText("#overviewTodayButton", activeDay ? `查看第 ${activeDay.id} 天 →` : "查看今日漫游 →");
    setText("#goldenHourScore", activeDay?.weather || "动态匹配");
  }

  function openItineraryDay(dayId) {
    const day = state.itinerary?.days?.find((item) => Number(item.id) === Number(dayId));
    if (!day) return;
    const nodes = day.activityDetails || [];
    const totalDistance = nodes.reduce((sum, node) => sum + Number(node.walkingKm || 0), 0);
    state.activeDay = day.id;
    state.itinerary.dayDetail = {
      day: day.id,
      title: day.title,
      totalDistance: `${totalDistance.toFixed(1)} km`,
      transit: `约 ${Math.max(25, nodes.length * 15)} 分钟`,
      weather: day.weather,
      nodes
    };
    resetReroute();
    renderOverview(state.itinerary);
    renderDayDetail(state.itinerary.dayDetail);
    window.switchView("03");
  }

  function renderDayDetail(detail) {
    if (!detail) return;
    setI18n("roamHeader", detail.title || "今日漫游");
    setI18n("roamSub", `${(detail.nodes || []).length} 项今日安排 · 按你的偏好排好顺序，也可以随时调整`);
    setText("#roamDayBadge", `DAY ${String(detail.day || 2).padStart(2, "0")}`);
    setI18n("node1Title", detail.nodes?.[0]?.title);
    setI18n("node1Desc", detail.nodes?.[0]?.desc);
    setI18n("node2Title", detail.nodes?.[1]?.title);
    setI18n("node2Desc", detail.nodes?.[1]?.desc);
    setI18n("node3Title", detail.nodes?.[2]?.title);
    setI18n("node3Desc", detail.nodes?.[2]?.desc);
    setI18n("node4Title", detail.nodes?.[3]?.title);
    setI18n("node4Desc", detail.nodes?.[3]?.desc);
    const header = document.querySelector("#view-03 h2");
    if (header && detail.title) header.textContent = `DAY ${detail.day || 2} · ${detail.title}`;
    renderRouteMap(detail);
    renderActivityCards(detail.nodes || []);
    renderRerouteBaseline();
  }

  function shortLabel(value, maxLength = 9) {
    const text = String(value || "");
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function renderRouteMap(detail) {
    const nodes = detail.nodes || [];
    const city = state.destination || state.destinations.find((item) => item.name === state.itinerary?.destination);
    setText("#routeMapTitle", `${state.itinerary?.destination || "城市"} · 当日区域路线示意`);
    setText("#routeWaterLabel", city?.water || "城市水系");
    setText("#goldenHourMap", `${state.itinerary?.destination || "城市"} · 黄金光影时段随当日路线更新`);
    setText("#routeAreaLabel1", nodes[0]?.meta?.split(" · ")[0] || "区域一");
    setText("#routeAreaLabel2", nodes[1]?.meta?.split(" · ")[0] || "区域二");
    for (let index = 0; index < 4; index += 1) {
      setText(`#routeNode${index + 1}`, shortLabel(nodes[index]?.title || `第${index + 1}站`));
    }
    const mobile = document.querySelector('[data-purpose="mobile-route-summary"]');
    if (mobile) {
      mobile.innerHTML = "";
      nodes.forEach((node, index) => {
        const stop = document.createElement("div");
        stop.setAttribute("data-purpose", "mobile-route-stop");
        stop.classList.add("editable-surface");
        stop.setAttribute("role", "button");
        stop.setAttribute("tabindex", "0");
        stop.onclick = () => focusActivityCard(index);
        stop.onkeydown = (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusActivityCard(index); }
        };
        const number = document.createElement("span");
        number.setAttribute("data-purpose", "mobile-route-number");
        number.textContent = String(index + 1);
        const content = document.createElement("div");
        const title = document.createElement("strong");
        title.className = "text-sm text-slate-900";
        title.textContent = node.title;
        const meta = document.createElement("div");
        meta.className = "text-xs text-slate-500 mt-1";
        meta.textContent = `${node.time} · ${node.meta?.split(" · ")[0] || "城市路线"}`;
        content.append(title, meta);
        stop.append(number, content);
        mobile.appendChild(stop);
      });
    }
    for (let index = 0; index < 4; index += 1) {
      const group = document.getElementById(`routeNode${index + 1}`)?.closest("g");
      if (!group) continue;
      group.style.cursor = nodes[index] ? "pointer" : "default";
      group.onclick = nodes[index] ? () => focusActivityCard(index) : null;
      group.setAttribute("role", nodes[index] ? "button" : "presentation");
      group.setAttribute("tabindex", nodes[index] ? "0" : "-1");
      group.onkeydown = nodes[index] ? (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusActivityCard(index); }
      } : null;
    }
  }

  function focusActivityCard(index) {
    const card = document.querySelectorAll("#activityStream .api-activity-card")[index];
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("ring-2", "ring-brand-400");
    void card.offsetWidth;
    card.classList.add("ring-2", "ring-brand-400");
    window.setTimeout(() => card.classList.remove("ring-2", "ring-brand-400"), 1400);
  }

  function renderActivityCards(nodes) {
    const stream = document.getElementById("activityStream") || document.querySelector("#view-03 > .space-y-4:last-child");
    if (!stream) return;
    stream.innerHTML = "";
    const isEnglish = document.documentElement.lang === "en";
    if (!nodes.length) {
      const empty = document.createElement("div");
      empty.className = "rounded-xl border thin-border bg-white p-6 text-sm text-slate-500";
      empty.textContent = isEnglish ? "Generate an itinerary to see today's plans." : "生成旅程后，这里会显示今天的具体安排。";
      stream.appendChild(empty);
      return;
    }
    nodes.forEach((node, index) => {
      const card = document.createElement("article");
      card.className = "api-activity-card bg-white rounded-xl border thin-border shadow-sm p-5 transition hover:shadow-md";
      card.id = `activity-card-${index + 1}`;
      card.dataset.stopNumber = String(index + 1);
      const meta = document.createElement("div");
      meta.className = "flex items-center justify-between gap-3 text-xs font-mono";
      const stop = document.createElement("span");
      stop.className = "font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded";
      stop.textContent = isEnglish ? `STOP ${String(index + 1).padStart(2, "0")}` : `第 ${String(index + 1).padStart(2, "0")} 站`;
      const duration = document.createElement("span");
      duration.className = "text-slate-400";
      duration.textContent = `${isEnglish ? "EST." : "预计"} ${node.durationMinutes || 90} ${isEnglish ? "MIN" : "分钟"}`;
      const metaActions = document.createElement("span");
      metaActions.className = "flex items-center gap-2";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "inline-flex items-center gap-1 rounded-lg border thin-border bg-white px-2.5 py-1.5 text-[11px] font-sans font-semibold text-brand-700 hover:bg-brand-50 transition";
      editButton.innerHTML = `<span class="material-symbols-outlined text-[15px]" aria-hidden="true">edit</span>${isEnglish ? "Edit stop" : "调整这一站"}`;
      editButton.onclick = () => openActivityEditor(node);
      metaActions.append(duration, editButton);
      meta.append(stop, metaActions);
      const title = document.createElement("h4");
      title.className = "text-base font-bold text-slate-900 mt-3";
      title.textContent = node.title;
      const description = document.createElement("p");
      description.className = "text-xs text-slate-500 mt-1 leading-relaxed";
      description.textContent = node.desc;
      const heading = document.createElement("div");
      heading.className = "mt-3 flex items-start gap-3";
      const iconBox = document.createElement("span");
      iconBox.className = "w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0";
      iconBox.setAttribute("aria-hidden", "true");
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined text-[20px]";
      icon.textContent = iconForInterest(node.category || node.tags?.[0]);
      iconBox.appendChild(icon);
      const headingCopy = document.createElement("div");
      headingCopy.className = "min-w-0";
      title.classList.remove("mt-3");
      const category = document.createElement("div");
      category.className = "mt-1 text-[11px] font-medium text-brand-700";
      category.textContent = node.category || node.tags?.[0] || (isEnglish ? "Personal stop" : "个性安排");
      headingCopy.append(title, description, category);
      heading.append(iconBox, headingCopy);
      const route = document.createElement("div");
      route.className = "mt-3 text-[11px] text-slate-500 font-mono";
      route.textContent = `${node.time || "按路线计算"} · ${node.meta || (isEnglish ? "City route" : "城市路线")}`;
      const feedbackBar = document.createElement("div");
      feedbackBar.className = "mt-4 pt-3 border-t thin-border flex flex-wrap items-center justify-between gap-2";
      const feedbackPrompt = document.createElement("span");
      feedbackPrompt.className = "text-[11px] text-slate-500";
      feedbackPrompt.textContent = isEnglish ? "Does this fit you?" : "这项安排适合你吗？";
      const buttons = document.createElement("div");
      buttons.className = "flex items-center gap-2";
      [["很像我", "Like me"], ["太赶了", "Too rushed"], ["不喜欢", "Not for me"]].forEach(([zh, en]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "px-3 py-1.5 text-xs rounded-lg border thin-border text-slate-700 hover:bg-brand-50 transition font-medium";
        button.textContent = isEnglish ? en : zh;
        button.onclick = (event) => window.recordFeedback(event, isEnglish ? en : zh, node.title);
        buttons.appendChild(button);
      });
      feedbackBar.append(feedbackPrompt, buttons);
      const placePhoto = createPlaceCover(node);
      if (placePhoto) card.appendChild(placePhoto);
      else iconBox.classList.add("scene-icon-fallback");
      const location = document.createElement("div");
      location.className = "stop-location";
      const city = state.itinerary?.destination || "";
      const address = city === "北京" && node.title === "UCCA 尤伦斯当代艺术中心"
        ? "北京市朝阳区酒仙桥路4号798艺术区" : "";
      const addressText = document.createElement("p");
      addressText.textContent = address || (isEnglish ? "Confirm the exact location in Maps before leaving." : "出发前请在地图中确认具体位置");
      const mapLink = document.createElement("a");
      const mapUrl = new URL("https://uri.amap.com/search");
      mapUrl.search = new URLSearchParams({keyword:node.title || "",city,view:"map",src:"TripTune",callnative:"1"});
      mapLink.href = mapUrl.href; mapLink.target = "_blank"; mapLink.rel = "noopener noreferrer";
      mapLink.textContent = isEnglish ? "Find in Amap →" : "在高德地图中查找 →";
      mapLink.setAttribute("aria-label", `${mapLink.textContent} ${city} ${node.title}`);
      location.append(addressText,mapLink);
      card.append(meta, heading, route, location, feedbackBar);
      stream.appendChild(card);
    });
  }

  function resetReroute() {
    state.replan = null;
    state.replanVersion += 1;
    document.getElementById("apiRerouteSummary")?.remove();
    document.querySelectorAll(".incident-btn").forEach((button) => {
      button.disabled = false;
      button.className = "incident-btn border rounded-xl p-3.5 text-left bg-white border-slate-200 hover:bg-slate-50 text-slate-800 transition";
      button.setAttribute("aria-pressed", "false");
    });
  }

  function renderRerouteBaseline() {
    const detailNodes = state.itinerary?.dayDetail?.nodes || [];
    const first = detailNodes[0];
    const second = detailNodes[1];
    setI18n("rerouteSub", state.itinerary ? `${state.itinerary.destination} · 第 ${state.activeDay} 天 · 选择遇到的情况，重新安排这一天的路线` : "先生成旅程，再根据途中变化调整路线");
    setText("#rerouteRiskLabel", "尚未选择现场变化");
    setText("#rerouteCoverageLabel", "等待改线计算");
    setText("#rerouteReplacementReason", "选择上方情况后，按当前城市重新选择地点。");
    setText("#rerouteImpactPositive", "计算后显示时间、预算和步行变化。");
    setText("#rerouteOriginalTitle", first?.title || "当前城市原定活动");
    setText("#rerouteOriginalTime", first?.time || "—");
    setText("#rerouteOriginalKeptTime", second?.time || "—");
    setText("#rerouteOriginalKeptTitle", second?.title || "其余高偏好活动");
    setText("#rerouteReplacementTitle", "等待现场变化后计算");
    setText("#rerouteKeptTitle", second?.title || "其余高偏好活动");
    setText("#rerouteReplacementTime", "—");
    setText("#rerouteKeptTime", second?.time || "—");
    setText("#rerouteImpactNotice", first ? `${first.title} · ${first.meta || "当前路线安排"}` : "选择现场变化后显示影响。");
    setText("#rerouteOriginalReason", first?.isIndoor ? "这一站在室内，可继续观察现场变化" : "这一站在室外，可根据现场变化替换");
    const accept = document.querySelector('[data-i18n="btnAcceptReroute"]');
    if (accept) accept.disabled = true;
    document.getElementById("rerouteEmptyState")?.classList.toggle("hidden", Boolean(first));
  }

  function renderFeedback(entries) {
    state.feedback = entries || [];
    const container = document.getElementById("feedbackLogContainer");
    if (!container) return;
    container.innerHTML = "";
    if (!state.feedback.length) {
      const empty = document.createElement("div");
      empty.className = "p-3 bg-slate-50 rounded-lg text-slate-500 border thin-border";
      empty.textContent = "还没有新的反馈记录";
      container.appendChild(empty);
      return;
    }
    state.feedback.slice(-6).reverse().forEach((entry) => {
      const row = document.createElement("div");
      row.className = "p-2.5 bg-slate-50 rounded-lg text-slate-600 flex justify-between items-center border thin-border";
      const activity = document.createElement("span");
      activity.textContent = entry.activity || "当前活动";
      const label = document.createElement("span");
      label.className = "text-brand-700 bg-brand-50 px-2 py-0.5 rounded font-semibold text-[11px]";
      label.textContent = entry.label || entry.feedback || "已反馈";
      row.append(activity, label);
      container.appendChild(row);
    });
  }

  function addRerouteSummary(result) {
    let panel = document.getElementById("apiRerouteSummary");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "apiRerouteSummary";
      panel.className = "mt-4 p-4 rounded-xl border border-brand-200 bg-brand-50/70 text-xs text-slate-700 space-y-2";
      const button = document.querySelector('[data-i18n="btnAcceptReroute"]');
      (button?.parentElement || document.getElementById("view-04")).before(panel);
    }
    panel.innerHTML = "";
    const title = document.createElement("div");
    title.className = "font-semibold text-brand-700";
    title.textContent = `${result.original || "原安排"} → ${result.replacement || "新安排"}`;
    const reason = document.createElement("div");
    reason.textContent = result.reason || "已根据现场变化重新安排。";
    const impact = document.createElement("div");
    impact.className = "font-mono text-[11px] text-slate-500";
    impact.textContent = `到达时间 ${result.timeChange || "—"} · 预算 ${Number(result.budgetChange || 0) >= 0 ? "+" : ""}${result.budgetChange || 0} · 步行 ${result.walking || "—"}`;
    panel.append(title, reason, impact);

    // Replace Stitch's illustrative Shanghai comparison with the current API proposal.
    const kept = state.itinerary?.dayDetail?.nodes?.find((node) => node.title !== result.original)?.title || "保留其余高偏好活动";
    setText("#rerouteOriginalTitle", result.original || "当前城市原定活动");
    setText("#rerouteOriginalTime", result.originalTime || "按路线计算");
    setText("#rerouteOriginalKeptTitle", kept);
    setText("#rerouteOriginalKeptTime", state.itinerary?.dayDetail?.nodes?.find((node) => node.title === kept)?.time || "按路线计算");
    setText("#rerouteReplacementTitle", result.replacement || "当前城市室内替代安排");
    setText("#rerouteKeptTitle", kept);
    setText("#rerouteReplacementTime", result.replacementTime || result.originalTime || "按路线计算");
    setText("#rerouteKeptTime", state.itinerary?.dayDetail?.nodes?.find((node) => node.title === kept)?.time || "按路线计算");
    setText("#rerouteRiskLabel", `${result.incident || "现场变化"} · 已重新评估`);
    setText("#rerouteCoverageLabel", result.incident === "rain" ? "室内候选已筛选" : "路线影响已计算");
    setText("#rerouteImpactNotice", result.reason || "已根据现场变化重新评估原安排。");
    setText("#rerouteOriginalReason", result.reason || "已根据现场变化重新评估");
    setText("#rerouteReplacementReason", result.reason || "按当前城市地点库重新选择");
    setText("#rerouteImpactPositive", `时间 ${result.timeChange || "—"} · 预算 ${Number(result.budgetChange || 0) >= 0 ? "+" : ""}${result.budgetChange || 0} · 步行 ${result.walking || "—"}`);
    const accept = document.querySelector('[data-i18n="btnAcceptReroute"]');
    if (accept) accept.disabled = false;
  }

  function renderItinerary(payload) {
    const itinerary = payload?.itinerary || payload;
    if (!itinerary) return;
    resetReroute();
    state.itinerary = itinerary;
    state.activeDay = itinerary.dayDetail?.day || itinerary.days?.[0]?.id || 1;
    const destinationPayload = payload?.destination;
    state.destination = destinationPayload && typeof destinationPayload === "object"
      ? destinationPayload
      : state.destinations.find((item) => item.name === itinerary.destination) || null;
    renderBriefFromItinerary(itinerary);
    const destinationInput = document.getElementById("destination");
    if (destinationInput) destinationInput.value = itinerary.destination;
    const destinationCode = state.destination?.code || itinerary.destination;
    document.querySelectorAll("#view-00 span").forEach((node) => {
      if (node.textContent.trim() === "???") node.textContent = destinationCode;
    });
    renderOverview(itinerary);
    renderDayDetail(itinerary.dayDetail);
    renderProof(payload);
    renderKeepsake(itinerary);
    renderRerouteBaseline();
    renderBoardingWindow();
  }

  function renderDynamicAfterTranslation() {
    renderBoardingWindow();
    updateInterestVisualization();
    if (!state.itinerary) return;
    renderOverview(state.itinerary);
    renderDayDetail(state.itinerary.dayDetail);
    renderKeepsake(state.itinerary);
    renderRerouteBaseline();
    if (state.replan) addRerouteSummary(state.replan);
  }

  function renderKeepsake(itinerary) {
    const city = state.destination || state.destinations.find((item) => item.name === itinerary.destination);
    const nodes = itinerary.dayDetail?.nodes || [];
    setText("#archiveCode", `ARCHIVE TT-${city?.code || "CITY"}-2026`);
    setText("#keepsakeCityCode", city?.englishName?.toUpperCase() || itinerary.destination);
    setText("#keepsakeCityStamp", `${itinerary.destination}旅程纪念邮戳`);
    setText("#keepsakeBadge1", `${nodes[0]?.tags?.[0] || "旅行偏好"}纪念章`);
    setText("#keepsakeBadge1Meta", `${city?.code || "TT"} · PERSONAL SIGNAL`);
    setText("#keepsakeTravelerStub", `${state.profile?.name || "用户"} · 18A`);
    setText("#keepsakeFlightStub", `TT-${String(itinerary.id || "LIVE").slice(-4).toUpperCase()}`);
    setI18n("recapHigh1Title", nodes[0]?.title || `${itinerary.destination}路线高光`);
    setI18n("recapHigh1Desc", nodes[0]?.desc || "已将本次选择保存为旅行记忆。");
    setI18n("recapHigh2Title", nodes[1]?.title || "反馈形成下一次推荐依据");
    setI18n("recapHigh2Desc", nodes[1]?.reason || "本次反馈将在下一次生成时参与排序。");
    setText("#keepsakeHighlightMeta", `${itinerary.destination} · ${itinerary.durationDays}天 · 今天${nodes.length}项安排`);
    setI18n("nextMemoryVal", `下一次去${itinerary.destination}，继续使用本次偏好与反馈`);
    setText("#nextMemoryMeta", `SQLITE · ${city?.code || "CITY"} · PERSONAL HISTORY`);
    setText("#tastePaceValue", `${itinerary.dayDetail?.totalDistance || "—"} · ${itinerary.pace || "balanced"}`);
    setText("#tasteNightValue", (itinerary.selectedInterests || []).filter((tag) => /爵士|音乐|夜|精酿|黑胶/.test(tag)).slice(0, 2).join(" · ") || "按本次兴趣计算");
    setText("#tasteDiningValue", (itinerary.selectedInterests || []).filter((tag) => /餐饮|咖啡|小馆|茶/.test(tag)).slice(0, 2).join(" · ") || "按本次兴趣计算");
    document.querySelectorAll("#view-05 img").forEach((image) => {
      image.hidden = true;
      image.parentElement?.classList.toggle("bg-gradient-to-br", image.hidden);
      image.parentElement?.classList.toggle("from-brand-100", image.hidden);
      image.parentElement?.classList.toggle("to-slate-200", image.hidden);
    });
  }

  function clearItineraryViews() {
    resetReroute();
    state.itinerary = null;
    ["#metricTransitValue", "#metricStayValue", "#metricBudgetValue", "#metricRadiusValue"].forEach((selector) => setText(selector, "等待本次旅程生成"));
    ["#metricTransitSubValue", "#metricStaySubValue", "#metricBudgetSubValue", "#metricRadiusSubValue"].forEach((selector) => setText(selector, "按本次输入计算"));
    setText("#routeMapTitle", "目的地待生成 · 当日区域路线示意");
    setText("#goldenHourMap", "生成旅程后显示当日路线");
    setText("#flightRouteLabel", "目的地待生成");
    setText("#flightStatusLabel", "填写偏好后生成旅程");
    setText("#boardingFlightCode", "等待生成");
    setText("#boardingIssuedDate", "生成后显示");
    setText("#boardingSeatGate", "—");
    setText("#waypointValue", "当前城市 · LIVE");
    [1, 2, 3].forEach((day) => {
      setI18n(`day${day}Title`, "等待本次旅程生成");
      setI18n(`day${day}Desc`, "输入目的地、天数与兴趣后生成当天安排。");
      setI18n(`day${day}Dist`, "等待本次旅程生成");
      setText(`#day${day}Summary`, "等待本次旅程生成");
      setText(`#day${day}Weather`, "—");
    });
    [1, 2, 3, 4].forEach((node) => {
      setI18n(`node${node}Title`, "等待本次旅程生成");
      setI18n(`node${node}Desc`, "输入目的地后显示具体安排。");
      setText(`#routeNode${node}`, `第${node}站`);
    });
    document.querySelectorAll(".api-activity-card").forEach((card) => card.remove());
    const overviewPrimary = document.querySelector('#view-02 [data-purpose="overview-primary"]');
    if (overviewPrimary) {
      overviewPrimary.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "rounded-xl border thin-border bg-white p-6 text-sm text-slate-500";
      empty.textContent = "生成旅程后，这里会显示按天拆分的真实安排。";
      overviewPrimary.appendChild(empty);
    }
    const activityStream = document.getElementById("activityStream");
    if (activityStream) activityStream.innerHTML = "";
    document.querySelectorAll("#view-02 [data-purpose=\"day-card-footer\"] > span:first-child").forEach((node) => node.textContent = "等待本次旅程生成");
    document.querySelectorAll("#view-03 [data-purpose=\"activity-meta\"]").forEach((meta) => {
      const spans = meta.querySelectorAll("span");
      if (spans[0]) spans[0].textContent = "按本次路线计算";
      if (spans[1]) spans[1].textContent = "等待生成";
      if (spans[2]) spans[2].textContent = "—";
    });
    document.querySelectorAll("#view-04 img, #view-05 img").forEach((image) => { image.hidden = true; });
    document.querySelectorAll(".api-extra-day").forEach((node) => node.remove());
    document.getElementById("dataProofPanel")?.remove();
    setText("#archiveCode", "ARCHIVE TT-CITY-2026");
    setText("#keepsakeCityCode", "CITY");
    setText("#keepsakeCityStamp", "当前城市旅程纪念邮戳");
    setText("#keepsakeTravelerStub", "当前档案 · 18A");
    setText("#keepsakeFlightStub", "等待生成");
    setI18n("recapHigh1Title", "等待本次旅程生成");
    setI18n("recapHigh1Desc", "生成旅程后，这里会显示本次路线高光。");
    setI18n("recapHigh2Title", "等待本次旅程生成");
    setI18n("recapHigh2Desc", "提交反馈后，这里会显示下一次推荐依据。");
    renderRerouteBaseline();
    state.replan = null;
    document.getElementById("apiRerouteSummary")?.remove();
    renderBoardingWindow();
  }

  async function loadProfileAndItinerary(profileId) {
    const [profile, keepsake] = await Promise.all([
      request(`/api/profiles/${profileId}`),
      request(`/api/keepsake/${profileId}`)
        .catch(() => ({ feedback: [] }))
    ]);
    let itinerary = null;
    try {
      itinerary = await request(`/api/itineraries/${profileId}`);
    } catch (error) {
      // No itinerary is a valid first-run state: keep the brief editable and
      // leave downstream views in their neutral empty state.
      if (error.status !== 404) throw error;
    }
    state.profileId = profileId;
    state.itinerary = null;
    renderProfile(profile);
    if (itinerary) renderItinerary(itinerary);
    else clearItineraryViews();
    renderFeedback(keepsake.feedback || []);
    return { profile, itinerary, keepsake };
  }

  async function generateItinerary() {
    const button = document.querySelector('[data-i18n="btnGeneratePlan"]');
    setButtonBusy(button, true);
    const form = collectBrief();
    try {
      const result = await request("/api/itinerary/generate", { method: "POST", body: JSON.stringify(form) });
      showDestinationError();
      renderProfile(result.profile);
      renderItinerary(result);
      window.switchView("02");
      toast(`已用 ${result.proof?.feedbackUsed || 0} 条历史反馈生成并保存旅程`);
    } catch (error) {
      if (error.field === "destination") showDestinationError(error.message);
      toast(error.message || "暂时无法生成，请检查输入后重试");
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function toggleTravelerFromApi() {
    toast('请在「我 → 旅行回忆」退出登录后切换账号。');
  }

  async function selectIncidentFromApi(eventOrType, maybeType) {
    const type = typeof eventOrType === "string" ? eventOrType : maybeType;
    if (!state.itinerary) {
      toast("请先生成旅程，再尝试改线");
      return;
    }
    resetReroute();
    renderRerouteBaseline();
    const version = state.replanVersion;
    const incidentButtons = [...document.querySelectorAll(".incident-btn")];
    incidentButtons.forEach((button) => {
      const selected = (button.getAttribute("onclick") || "").includes(`'${type}'`);
      button.setAttribute("aria-pressed", String(selected));
      button.className = selected
        ? "incident-btn border-2 rounded-xl p-3.5 text-left bg-brand-50/70 border-brand-600 text-brand-900 transition shadow-sm"
        : "incident-btn border rounded-xl p-3.5 text-left bg-white border-slate-200 hover:bg-slate-50 text-slate-800 transition";
    });
    incidentButtons.forEach((button) => { button.disabled = true; });
    try {
      const result = await request("/api/itinerary/replan", { method: "POST", body: JSON.stringify({ profileId: state.profileId, itineraryId: state.itinerary?.id, day: state.activeDay, incident: type }) });
      if (version !== state.replanVersion) return;
      state.replan = result;
      addRerouteSummary(result);
      toast("已重新评估剩余路线");
    } catch (error) {
      if (version !== state.replanVersion) return;
      toast("暂时无法计算替代路线");
    } finally {
      if (version === state.replanVersion) incidentButtons.forEach((button) => { button.disabled = false; });
    }
  }

  async function confirmRerouteFromApi() {
    if (!state.replan) {
      toast("请先选择一种现场变化");
      return;
    }
    const button = document.querySelector('[data-i18n="btnAcceptReroute"]');
    const version = state.replanVersion;
    if (button) button.disabled = true;
    try {
      const result = await request("/api/itinerary/accept", { method: "POST", body: JSON.stringify({ profileId: state.profileId, replanId: state.replan.id, incident: state.replan.incident }) });
      if (version !== state.replanVersion) return;
      renderItinerary(result.itinerary);
      window.switchView("03");
      toast("新路线已同步到今日漫游");
    } catch (error) {
      if (version !== state.replanVersion) return;
      if (button) button.disabled = false;
      toast("暂时无法同步新路线");
    }
  }

  async function recordFeedbackFromApi(eventOrLabel, maybeLabel, maybeActivity) {
    const label = typeof eventOrLabel === "string" ? eventOrLabel : maybeLabel;
    const event = typeof eventOrLabel === "string" ? null : eventOrLabel;
    let activity = maybeActivity;
    if (!activity && event?.currentTarget) {
      const card = event.currentTarget.closest(".bg-white") || event.currentTarget.parentElement;
      activity = card?.querySelector("h4")?.textContent?.trim() || "当前活动";
    }
    if (!state.itinerary) {
      toast("请先生成旅程，再提交活动反馈");
      return;
    }
    const button = event?.currentTarget;
    if (button?.disabled) return;
    const siblingButtons = button ? [...button.parentElement.querySelectorAll("button")] : [];
    siblingButtons.forEach((item) => { item.disabled = true; });
    try {
      const result = await request("/api/feedback", { method: "POST", body: JSON.stringify({ profileId: state.profileId, activity: activity || "当前活动", label: label || "已反馈" }) });
      renderFeedback(result.feedback || []);
      if (result.learning) state.profile = { ...state.profile, learning: result.learning };
      if (button) {
        button.classList.add("border-brand-600", "bg-brand-50", "text-brand-700", "font-bold");
        button.setAttribute("aria-pressed", "true");
      }
      toast(`已写入数据库：${label || "你的反馈"}，下次生成会使用`);
    } catch (error) {
      siblingButtons.forEach((item) => { item.disabled = false; });
      toast("服务暂时不可用，反馈未写入数据库");
    }
  }

  function patchHandlers() {
    const brand = document.querySelector('[data-purpose="sidebar-brand"]');
    if (brand) {
      const logo = document.createElement("img"); logo.src="/assets/triptune-logo.png";logo.alt="TripTune";logo.style.cssText="width:170px;height:auto;display:block";
      brand.replaceChildren(logo);
    }
    ["duration", "partySize"].forEach(id => {
      const select = document.getElementById(id);
      if (!select || document.getElementById(`${id}Stepper`)) return;
      const stepper = document.createElement("div"); stepper.id = `${id}Stepper`; stepper.className = "trip-stepper";
      const value = document.createElement("output"); value.setAttribute("aria-live", "polite");
      const minus = document.createElement("button"); const plus = document.createElement("button");
      minus.type = plus.type = "button"; minus.textContent = "−"; plus.textContent = "+";
      const label = id === "duration" ? "天数" : "人数";
      minus.setAttribute("aria-label", `减少${label}`); plus.setAttribute("aria-label", `增加${label}`);
      const sync = () => { value.textContent = `${select.value} ${id === "duration" ? "天" : "人"}`; minus.disabled = select.selectedIndex <= 0; plus.disabled = select.selectedIndex >= select.options.length - 1; };
      const change = delta => { select.selectedIndex = Math.max(0,Math.min(select.options.length-1,select.selectedIndex+delta)); select.dispatchEvent(new Event("change", {bubbles:true})); sync(); };
      minus.onclick = () => change(-1); plus.onclick = () => change(1);
      select.addEventListener("change", sync);
      select.classList.add("stepper-source");
      select.tabIndex = -1;
      stepper.append(minus,value,plus); select.after(stepper); sync();
      new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true});
    });
    setupPersonalPage();
    setupCoreNavigation();
    setupPlanningExperience();
    ensureFormControls();
    setupInterestTags();
    const generateButton = document.querySelector('[data-i18n="btnGeneratePlan"]');
    if (generateButton) generateButton.onclick = () => window.generateItinerary();

    document.getElementById("addCustomInterest")?.addEventListener("click", addCustomInterest);
    document.getElementById("customInterestInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCustomInterest();
      }
    });
    ["destination", "duration", "briefBudgetSelect", "partySize"].forEach((id) => {
      const control = document.getElementById(id);
      const eventName = control?.tagName === "SELECT" ? "change" : "input";
      control?.addEventListener(eventName, () => updateBriefSummaryPreview(true));
    });
    document.querySelectorAll('input[name="pace"]').forEach((input) => {
      input.addEventListener("change", () => {
        refreshPaceStyles();
        updateBriefSummaryPreview(true);
      });
    });

    document.getElementById("openProfileEditor")?.addEventListener("click", () => window.switchView("06"));
    const mobileProfile = document.querySelector('[data-purpose="mobile-traveler-switch"]');
    if (mobileProfile) {
      mobileProfile.onclick = () => window.switchView("06");
      mobileProfile.setAttribute("aria-label", "编辑我的旅行偏好");
      const icon = mobileProfile.querySelector(".material-symbols-outlined");
      if (icon) icon.textContent = "manage_accounts";
    }
    document.getElementById("closeProfileEditor")?.addEventListener("click", closeProfileEditor);
    document.getElementById("cancelProfileEditor")?.addEventListener("click", closeProfileEditor);
    document.getElementById("switchProfileTraveler")?.addEventListener("click", toggleTravelerFromApi);
    document.getElementById("profileEditorForm")?.addEventListener("submit", saveProfile);
    document.getElementById("profileAvatarFile")?.addEventListener("change", chooseProfileAvatar);
    document.getElementById("removeProfileAvatar")?.addEventListener("click", () => {
      pendingAvatar = "";
      renderAvatar(document.getElementById("profileAvatarPreview"), "", document.getElementById("profileName").value);
    });
    document.getElementById("profileEditor")?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeProfileEditor();
    });
    document.getElementById("closeActivityEditor")?.addEventListener("click", closeActivityEditor);
    document.getElementById("cancelActivityEditor")?.addEventListener("click", closeActivityEditor);
    document.getElementById("activityEditorForm")?.addEventListener("submit", saveActivity);
    document.getElementById("activityEditor")?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeActivityEditor();
    });

    document.querySelectorAll(".incident-btn").forEach((button) => {
      const match = (button.getAttribute("onclick") || "").match(/selectIncident\(['\"]([^'\"]+)/);
      const type = match?.[1] || "rain";
      button.onclick = (event) => window.selectIncident(event, type);
    });

    document.querySelectorAll('button[onclick*="recordFeedback"]').forEach((button) => {
      const label = button.textContent.trim();
      button.onclick = (event) => window.recordFeedback(event, label);
    });

    const accept = document.querySelector('[data-i18n="btnAcceptReroute"]');
    if (accept) accept.onclick = () => window.confirmReroute();

    const exportButton = document.querySelector('[data-i18n="btnExportArchive"]');
    if (exportButton) exportButton.onclick = exportTripArchive;
    patchEditableSurfaces();
    setupPlanningChat();
  }

  function setupPlanningChat() {
    const page = document.getElementById("view-01");
    if (!page || document.getElementById("planningChat")) return;
    const section = document.createElement("section");
    section.id = "planningChat";
    section.className = "planning-chat";
    section.innerHTML = `<h3>说说你想怎么旅行</h3><label for="planningMessage">目的地、天数、同行人数，以及想做的事</label><textarea id="planningMessage" rows="3" maxlength="2000" placeholder="比如：去北京三天，两个人，想逛书店和美术馆，每天慢慢逛。"></textarea><p class="planning-privacy">发送的文字将由魔搭模型处理，不会附带你的个人资料或旅行回忆。当前支持六座城市、1—7天行程。</p><button type="button" id="planningSend">帮我整理安排</button><div id="planningReply" role="status" aria-live="polite"></div><button type="button" id="planningConfirm" hidden>确认并生成行程</button>`;
    const aiNote = document.createElement("p");
    section.querySelector("h3").textContent = "这次你有什么想法？";
    const headingAccent = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    headingAccent.setAttribute("viewBox", "0 0 32 32");
    headingAccent.setAttribute("aria-hidden", "true");
    headingAccent.setAttribute("focusable", "false");
    headingAccent.classList.add("planning-heading-accent");
    headingAccent.innerHTML = '<circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m21 10-3 9-7 3 3-9Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>';
    section.querySelector("h3").appendChild(headingAccent);
    aiNote.className = "planning-privacy";
    aiNote.textContent = "AI 帮你整理想法，偶尔也会会错意。出发你做主，确认前记得看一眼。";
    section.querySelector("#planningSend").before(aiNote);
    page.children[0].after(section);
    const input = section.querySelector("textarea");
    const send = section.querySelector("#planningSend");
    const reply = section.querySelector("#planningReply");
    const confirm = section.querySelector("#planningConfirm");
    let proposal = null;
    input.addEventListener("input", () => { proposal=null;confirm.hidden=true; });
    send.onclick = async () => {
      if (!input.value.trim()) { input.focus(); return; }
      const submitted = input.value;
      send.disabled=true;send.textContent="正在整理…";confirm.hidden=true;proposal=null;
      reply.textContent="";
      try {
        const result=await request("/api/planning/interpret",{method:"POST",body:JSON.stringify({message:submitted})});
        if (input.value!==submitted) { reply.textContent="内容已修改，请重新发送。"; return; }
        proposal=result.proposal;
        const labels={destination:"目的地",durationDays:"天数",partySize:"人数",budget:"预算（元）",interests:"想体验",pace:"节奏"};
        const paces={relaxed:"慢慢逛",balanced:"有重点也有休息",dense:"多安排一些"};
        reply.replaceChildren();
        for (const [key,value] of Object.entries(proposal)) {
          const line=document.createElement("p");
          line.textContent=`${labels[key] || key}：${key==='pace'?paces[value]:Array.isArray(value)?value.join('、'):value}`;
          reply.appendChild(line);
        }
        const note=document.createElement("p");note.textContent="未提到的内容保留当前填写值。可以修改上方文字重新整理，确认后才会生成并保存。";reply.appendChild(note);
        confirm.hidden=Object.keys(proposal).length===0;
        if (confirm.hidden) note.textContent="请补充想去的城市、天数或兴趣。";
      } catch(error) { reply.textContent=error.message; }
      finally { send.disabled=false;send.textContent="帮我整理安排"; }
    };
    confirm.onclick=async () => {
      if (!proposal) return;
      const merged={...collectBrief(),...proposal};
      renderBriefFromItinerary({...merged,selectedInterests:merged.interests});
      confirm.disabled=true;
      try { await generateItinerary(); } finally {confirm.disabled=false;}
    };
  }

  window.generateItinerary = generateItinerary;
  function setupCoreNavigation() {
    const rail = document.querySelector('[data-purpose="sidebar-nav"]');
    const slider = document.createElement("div");
    slider.className = "nav-glass-slider";
    slider.setAttribute("aria-hidden", "true");
    rail?.appendChild(slider);
    const moveSlider = () => {
      const active = rail?.querySelector('[aria-current="page"]:not([hidden])');
      if (!active) { slider.style.opacity = "0"; return; }
      slider.style.width = `${active.offsetWidth}px`;
      slider.style.height = `${active.offsetHeight}px`;
      slider.style.transform = `translate3d(${active.offsetLeft}px,${active.offsetTop}px,0)`;
      slider.style.opacity = "1";
    };
    if (rail) new ResizeObserver(moveSlider).observe(rail);
    const names = { "01": ["规划", "Plan"], "02": ["行程", "Trips"], "06": ["我", "Me"] };
    const refresh = () => {
      const en = document.documentElement.lang === "en";
      document.querySelectorAll("[data-nav]").forEach(button => {
        const name = names[button.dataset.nav];
        button.hidden = !name;
        if (name) {
          const label = button.querySelector("div > span:last-child");
          if (label) { label.removeAttribute("data-i18n"); label.textContent = name[en ? 1 : 0]; }
          button.querySelector(":scope > span")?.remove();
        }
      });
    };
    refresh();
    const originalSwitch = window.switchView;
    window.switchView = (key) => {
      originalSwitch(key);
      if (key === "01") window.refreshPlanningSummary?.();
      refresh();
      const active = ["03", "04", "05"].includes(key) ? "02" : key;
      document.querySelectorAll("[data-nav]").forEach(button => {
        if (button.dataset.nav === active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      moveSlider();
    };
    requestAnimationFrame(moveSlider);
    const metrics = document.querySelector('[data-purpose="overview-metrics"]');
    if (metrics && !metrics.closest("details")) {
      const disclosure = document.createElement("details");
      disclosure.className = "trip-practical-details";
      const title = document.createElement("summary");
      title.textContent = "交通、住宿区域与预算";
      metrics.before(disclosure); disclosure.append(title, metrics);
    }
    ["02", "03", "04", "05"].forEach(key => {
      const page = document.getElementById(`view-${key}`);
      const nav = document.createElement("nav");
      nav.className = "flex flex-wrap gap-2 mb-4";
      nav.setAttribute("aria-label", "当前旅程操作");
      [["02", "全部行程"], ["03", "当天安排"], ["04", "调整行程"], ["05", "旅行回忆"]].forEach(([target, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.className = "px-3 py-2 rounded-lg border thin-border text-sm text-brand-700 hover:bg-brand-50";
        if (target === key) button.setAttribute("aria-current", "page");
        button.onclick = () => window.switchView(target);
        nav.appendChild(button);
      });
      page?.prepend(nav);
    });
    const brand = document.querySelector('img[alt="TripTune Artistic Celestial Emblem"]');
    if (brand) {
      const home = document.createElement("button");
      home.type = "button";
      home.setAttribute("aria-label", "返回登机首页");
      brand.before(home);
      home.appendChild(brand);
      home.onclick = () => window.switchView("00");
    }
  }

  function setupPersonalPage() {
    const nav = document.querySelector('[data-purpose="sidebar-nav"]');
    const button = document.createElement("button");
    button.className = "nav-item w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition";
    button.dataset.nav = "06";
    button.innerHTML = '<div class="flex items-center gap-2.5"><span class="material-symbols-outlined text-[17px]">person</span><span>我</span></div>';
    button.onclick = () => window.switchView("06");
    nav?.appendChild(button);
    const page = document.createElement("section");
    page.id = "view-06";
    page.className = "hidden max-w-5xl mx-auto space-y-6";
    page.innerHTML = `
      <header><h2 class="text-2xl font-bold text-slate-900">我的旅行</h2><p class="mt-2 text-sm text-slate-600">喜欢的地方，留着下次接着逛。</p></header>
      <div class="personal-identity bg-white rounded-xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div><div id="personalAvatar" style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:#e5eff0;display:grid;place-items:center;margin-bottom:12px"></div><h3 id="personalName" class="text-xl font-semibold text-brand-800">正在读取资料…</h3><p class="mt-2 text-xs text-slate-500">共享体验档案，请勿填写个人隐私</p></div>
        <button id="personalEdit" class="px-4 py-2.5 rounded-lg bg-brand-700 text-white text-sm font-semibold">编辑资料与偏好</button>
      </div>
      <div class="personal-preferences grid grid-cols-1 md:grid-cols-2 gap-6">
        <section class="personal-tastes"><div class="personal-section-heading"><h3 class="text-base font-semibold">我喜欢这样玩</h3><button id="personalTasteEdit" type="button">调整偏好</button></div><div id="personalInterests" class="personal-interest-cloud"></div><div class="personal-travel-style"><span class="material-symbols-outlined" aria-hidden="true">footprint</span><p id="personalPace"></p></div><div class="personal-travel-style"><span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span><p>常用预算 <strong id="personalBudget"></strong></p></div></section>
        <section class="bg-white rounded-xl border thin-border p-5"><h3 class="text-base font-semibold">我的反馈</h3><p class="mt-2 text-sm text-slate-500">你的选择会参与下一次旅行推荐。</p><div id="personalFeedback" class="mt-4 space-y-3 text-sm"></div></section>
      </div>
      <section class="personal-journeys"><div class="flex items-center justify-between gap-3"><h3 class="text-lg font-semibold">已保存的旅程</h3><button id="personalNewTrip" class="text-sm font-semibold text-brand-700">规划新旅程 →</button></div><div id="personalTrips" class="mt-4"></div></section>
      <p id="personalError" role="status" class="text-sm text-red-700"></p>`;
    document.getElementById("view-05")?.after(page);
    page.querySelector(".personal-preferences").before(page.querySelector(".personal-journeys"));
    document.getElementById("personalEdit").onclick = openProfileEditor;
    document.getElementById("personalTasteEdit").onclick = openProfileEditor;
    document.getElementById("personalNewTrip").onclick = () => window.switchView("01");
  }

  async function renderPersonalPage() {
    const profileId = state.profileId;
    setText("#personalError", "");
    setText("#personalTrips", "正在读取已保存旅程…");
    try {
      const [profile, trips, keepsake] = await Promise.all([
        request(`/api/profiles/${profileId}`), request(`/api/profiles/${profileId}/trips`), request(`/api/keepsake/${profileId}`)
      ]);
      if (profileId !== state.profileId) return;
      state.profile = profile;
      setText("#personalName", profile.name);
      renderAvatar(document.getElementById("personalAvatar"), profile.avatar, profile.name);
      setText("#personalBudget", `¥${Number(profile.budget).toLocaleString("zh-CN")}`);
      setText("#personalPace", ({relaxed:"慢慢逛，留足休息时间", balanced:"有重点，也有自由时间", dense:"尽量多看，少走回头路"})[profile.pace]);
      const interests = document.getElementById("personalInterests");
      interests.replaceChildren(...profile.interests.map(interest => {
        const tag = document.createElement("span"); tag.className = "personal-interest"; tag.textContent = interest; return tag;
      }));
      const feedback = document.getElementById("personalFeedback");
      feedback.replaceChildren();
      (keepsake.feedback || []).filter(item => item.source === "live").slice(-4).reverse().forEach(item => {
        const row = document.createElement("p"); row.textContent = `${item.activity} · ${item.label}`; feedback.appendChild(row);
      });
      if (!feedback.childElementCount) feedback.textContent = "还没有反馈。旅途中遇到喜欢的安排，记得告诉我们。";
      const list = document.getElementById("personalTrips");
      list.replaceChildren();
      for (const trip of trips) {
        const row = document.createElement("button");
        row.className = "saved-trip-open w-full p-5 flex flex-wrap items-center justify-between gap-3 text-left transition";
        const title = document.createElement("strong"); title.textContent = trip.displayName || `${trip.destination} · ${trip.durationDays}天`;
        const meta = document.createElement("span"); meta.className = "saved-trip-meta"; meta.textContent = `${new Date(trip.createdAt).toLocaleDateString("zh-CN")} 保存`;
        row.setAttribute("aria-label", `查看${trip.destination}${trip.durationDays}天旅程`);
        row.append(title, meta);
        row.onclick = async () => {
          row.disabled = true;
          try { const saved = await request(`/api/itineraries/${trip.id}`); if (state.profileId !== profileId) return; state.replan = null; renderItinerary(saved); window.switchView("02"); }
          catch (error) { setText("#personalError", `旅程加载失败：${error.message}`); }
          finally { row.disabled = false; }
        };
        const entry = document.createElement("article");
        entry.className = "saved-trip-entry";
        const cover = createCityCover(trip.destination);
        let credits;
        if (cover) {
          const caption = cover.querySelector("figcaption");
          if (caption) {
            credits = document.createElement("details");
            credits.className = "saved-trip-credits";
            const summary = document.createElement("summary"); summary.textContent = "照片来源";
            const content = document.createElement("div");
            content.append(...caption.childNodes); caption.remove();
            credits.append(summary,content);
          }
          row.prepend(cover);
        }
        entry.appendChild(row);
        const actions = document.createElement("div"); actions.className = "saved-trip-actions";
        const rename = document.createElement("button"); rename.type="button"; rename.textContent="重命名";
        const remove = document.createElement("button"); remove.type="button"; remove.textContent="删除";
        const manage = async (action,name) => { await request(`/api/itineraries/${trip.id}`,{method:"POST",body:JSON.stringify({profileId,action,name})}); };
        rename.onclick = async () => {
          const name = window.prompt("给这段旅程起个名字",trip.displayName || `${trip.destination} · ${trip.durationDays}天`);
          if (!name?.trim()) return;
          try { await manage("rename",name.trim()); await renderPersonalPage(); } catch { toast("修改失败，请重试"); }
        };
        remove.onclick = async () => {
          if (!window.confirm("从你已保存的旅程中删除？")) return;
          try {
            await manage("delete"); entry.replaceChildren();
            const undo = document.createElement("button"); undo.type="button";undo.className="saved-trip-actions";undo.textContent="已删除 · 撤销";
            undo.onclick=async()=>{try{await manage("restore");await renderPersonalPage();}catch{toast("恢复失败，请重试");}};
            entry.append(undo);
          } catch { toast("删除失败，请重试"); }
        };
        actions.append(rename,remove); entry.append(actions);
        if (credits) entry.appendChild(credits);
        list.appendChild(entry);
      }
      if (!trips.length) { const empty = document.createElement("p"); empty.className = "p-5 text-sm text-slate-500"; empty.textContent = "还没有保存的旅程。填写规划旅程，开始第一段旅行。"; list.appendChild(empty); }
    } catch (error) {
      setText("#personalTrips", "暂时无法读取旅程");
      setText("#personalError", `加载失败：${error.message}。请重新点击「我的」重试。`);
    }
  }
  window.tripTuneRenderPersonal = renderPersonalPage;
  window.tripTuneToggleTraveler = toggleTravelerFromApi;
  window.selectIncident = selectIncidentFromApi;
  window.confirmReroute = confirmRerouteFromApi;
  window.recordFeedback = recordFeedbackFromApi;
  window.openTripProfile = openProfileEditor;
  window.openActivityEditor = openActivityEditor;
  window.exportTripArchive = exportTripArchive;
  window.tripTuneRefreshLanguage = () => {
    if (state.profile) renderProfile(state.profile);
    renderDynamicAfterTranslation();
  };

  document.addEventListener("DOMContentLoaded", async () => {
    patchHandlers();
    setupWindowExperience();
    try {
      const session = await request("/api/auth/me");
      state.profileId = session.profileId;
      document.getElementById('switchProfileTraveler')?.remove();
      document.querySelectorAll('[aria-label="切换旅行者"]').forEach(node=>node.remove());
      document.querySelectorAll('[data-i18n="demoNotice"]').forEach(node=>{node.removeAttribute('data-i18n');node.textContent='你的旅程与回忆，默认私密';});
      document.querySelectorAll('#view-06 p').forEach(p=>{if(p.textContent.includes('共享体验档案'))p.textContent='你的资料与旅程，仅自己可见。';});
      setupPrivateMemories();
      await loadDestinations();
      await loadProfileAndItinerary(state.profileId);
    } catch (error) {
      if(error.status===401){showAccountLogin();return;}
      // A disconnected API is an empty/error state, never permission to show
      // stale illustrative itinerary data from the design export.
      clearItineraryViews();
      toast("无法连接旅程服务，请确认后端已启动后重试");
    }
  });

  function showAccountLogin() {
    const dialog=document.createElement("dialog");dialog.className="planning-chat";
    dialog.innerHTML='<h3>登录 TripTune</h3><p>新账号从空白旅程开始，回忆仅自己可见。</p><form><label>用户名（字母、数字或下划线）<input name="username" autocomplete="username" required minlength="3" maxlength="30"></label><label>密码（至少10位）<input name="password" type="password" autocomplete="current-password" required minlength="10" maxlength="128"></label><p role="status"></p><button name="login" type="submit">登录</button><button name="register" type="submit">注册新账号</button></form>';
    document.body.appendChild(dialog);dialog.showModal();
    dialog.addEventListener('cancel',event=>event.preventDefault());
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget;const action=event.submitter?.name==='register'?'register':'login';
      const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      try {await request(`/api/auth/${action}`,{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value})});window.location.reload();}
      catch(error){form.querySelector('[role=status]').textContent=error.message;buttons.forEach(b=>b.disabled=false);}
    };
  }

  function setupPrivateMemories() {
    const page=document.getElementById('view-06');if(!page||document.getElementById('privateMemories'))return;
    const section=document.createElement('section');section.id='privateMemories';section.className='planning-chat';
    section.innerHTML='<h3>旅行回忆</h3><p>仅自己可见，不发送给 AI。</p><button type="button" id="newMemory">记一笔</button><button type="button" id="accountLogout">退出登录</button><form hidden id="memoryForm"><label>日期<input type="date" name="date" required></label><label>地点<input name="place" maxlength="100"></label><label>写点什么<textarea name="text" maxlength="2000" rows="4"></textarea></label><label>添加照片<input type="file" accept="image/jpeg,image/png,image/webp" name="photo"></label><label><input type="checkbox" name="draft">先存为草稿</label><button type="submit">保存</button><button type="button" id="cancelMemory">取消</button></form><p id="memoryStatus" role="status"></p><div id="memoryList"></div>';
    page.appendChild(section);
    const form=section.querySelector('form'),status=section.querySelector('#memoryStatus'),list=section.querySelector('#memoryList');
    let editing=null,photo='';
    const open=record=>{editing=record?.id||null;photo=record?.photo||'';form.reset();form.elements.date.value=record?.date||new Date().toLocaleDateString('en-CA');form.elements.place.value=record?.place||'';form.elements.text.value=record?.text||'';form.elements.draft.checked=!!record?.draft;form.hidden=false;form.elements.text.focus();};
    section.querySelector('#newMemory').onclick=()=>open(null);
    section.querySelector('#cancelMemory').onclick=()=>{form.hidden=true;};
    section.querySelector('#accountLogout').onclick=async()=>{try{await request('/api/auth/logout',{method:'POST',body:'{}'});window.location.reload();}catch(error){status.textContent=error.message;}};
    const removePhoto=document.createElement('button');removePhoto.type='button';removePhoto.textContent='移除照片';removePhoto.onclick=()=>{photo='';form.elements.photo.value='';status.textContent='照片已移除，保存后生效。';};form.elements.photo.after(removePhoto);
    const note=document.createElement('p');note.textContent='照片会压缩保存，不替代原图备份。';form.elements.photo.closest('label').after(note);
    const refresh=async()=>{
      try {const records=await request('/api/memories');list.replaceChildren();
        if(!records.length)list.textContent='留下这次旅行的第一段回忆。';
        for(const record of records){const card=document.createElement('article');card.style.margin='24px 0';
          if(record.photo){const image=document.createElement('img');image.src=record.photo;image.alt='你添加的旅行照片';image.style.maxWidth='100%';card.appendChild(image);}
          const title=document.createElement('h4');title.textContent=`${record.date} · ${record.place}${record.draft?' · 草稿':''}`;
          const text=document.createElement('p');text.textContent=record.text;
          const edit=document.createElement('button');edit.textContent='编辑';edit.onclick=()=>open(record);
          const remove=document.createElement('button');remove.textContent='删除';remove.onclick=async()=>{if(!confirm('删除这条回忆？此操作不能撤销。'))return;try{await request(`/api/memories/${record.id}/delete`,{method:'POST',body:'{}'});await refresh();}catch(error){status.textContent=error.message;}};
          const download=document.createElement('button');download.textContent='下载 PNG';download.onclick=()=>exportMemoryImage(record).catch(()=>{status.textContent='图片导出失败，请重试。';});
          card.append(title,text,edit,download,remove);list.appendChild(card);
        }
      }catch(error){status.textContent=error.message;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='正在保存…';
      try{
        const file=form.elements.photo.files[0];
        if(file){if(file.size>10*1024*1024)throw new Error('请选择10MB以内的照片。');const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const ratio=Math.min(1,400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();photo=canvas.toDataURL('image/jpeg',.65);if(photo.length>48000)throw new Error('照片压缩后仍过大，请裁切后重试。');}
        await request('/api/memories',{method:'POST',body:JSON.stringify({id:editing,date:form.elements.date.value,place:form.elements.place.value,text:form.elements.text.value,photo,draft:form.elements.draft.checked})});form.hidden=true;status.textContent='已私密保存';await refresh();
      }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    };
    refresh();
  }

  async function exportMemoryImage(record) {
    await document.fonts.ready;
    const canvas=document.createElement('canvas');canvas.width=1200;
    const ctx=canvas.getContext('2d');ctx.font='32px sans-serif';
    const lines=[];let line='';
    for(const char of record.text){if(char==='\n'||ctx.measureText(line+char).width>1040){lines.push(line);line=char==='\n'?'':char;}else line+=char;}lines.push(line);
    let image=null;
    if(record.photo){image=new Image();image.src=record.photo;await image.decode();}
    const photoHeight=image?Math.round(1040*image.height/image.width):0;
    canvas.height=340+photoHeight+lines.length*50;
    ctx.fillStyle='#f7f4ec';ctx.fillRect(0,0,1200,canvas.height);
    ctx.fillStyle='#164b48';ctx.font='italic 56px Georgia';ctx.fillText('TripTune',80,100);
    ctx.font='32px sans-serif';ctx.fillText(`${record.date} · ${record.place}`.slice(0,48),80,170,1040);
    if(image)ctx.drawImage(image,80,210,1040,photoHeight);
    ctx.font='32px sans-serif';lines.forEach((text,i)=>ctx.fillText(text,80,260+photoHeight+i*50));
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('export_failed');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`TripTune-旅行回忆-${record.date}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
})();
