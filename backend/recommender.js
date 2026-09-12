const paceConfiguration = {
  relaxed: { activitiesPerDay: 2, walkingPenalty: 0.55, label: "松弛留白" },
  balanced: { activitiesPerDay: 3, walkingPenalty: 0.25, label: "张弛有度" },
  dense: { activitiesPerDay: 4, walkingPenalty: 0.05, label: "高效充实" }
};

const timeRanges = {
  2: ["10:00–12:00", "15:00–17:30"],
  3: ["09:30–11:30", "14:00–16:00", "19:30–21:30"],
  4: ["08:30–10:30", "11:00–12:30", "14:00–16:00", "19:00–21:00"]
};

function matches(tags, interests) {
  return tags.filter((tag) => interests.some((interest) => tag.includes(interest) || interest.includes(tag)));
}

function scoredPlace(place, input, profile, evidence) {
  const selectedMatches = matches(place.tags, input.interests);
  const profileMatches = matches(place.tags, profile.interests);
  const learnedSignals = place.tags
    .map((tag) => ({ tag, weight: evidence.tagWeights[tag] || 0 }))
    .filter(({ weight }) => weight !== 0);
  const feedbackScore = learnedSignals.reduce((sum, { weight }) => sum + weight, 0);
  const perPersonBudget = input.budget / Math.max(1, input.partySize);
  const priceYuan = place.priceCents / 100;
  const budgetShare = priceYuan / Math.max(1, perPersonBudget);
  const config = paceConfiguration[input.pace];
  // Budget is an actual ranking signal, not decoration. Lower budgets strongly
  // favour free/low-cost places; a more generous budget can unlock paid venues.
  // The piecewise slope keeps a ¥500 trip from overspending while preserving
  // interest relevance for normal budgets.
  const budgetFit = perPersonBudget < 1200
    ? -priceYuan * 0.08
    : perPersonBudget < 3000
      ? -priceYuan * 0.025
      : Math.min(priceYuan, 220) * 0.012;
  const score = (
    selectedMatches.length * 6
    + profileMatches.length * 2.5
    + feedbackScore * 1.8
    + (place.isIndoor ? 0.2 : 0)
    - Math.max(0, budgetShare - 0.18) * 8
    + budgetFit
    - place.walkingKm * config.walkingPenalty * (1 + evidence.rushedCount * 0.18)
  );
  return { ...place, score, selectedMatches, profileMatches, learnedSignals };
}

function reasonFor(place, input, profile, evidence) {
  const parts = [];
  if (place.selectedMatches.length) parts.push(`匹配你本次选择的「${place.selectedMatches.slice(0, 2).join("、")}」`);
  const positiveLearned = place.learnedSignals.filter(({ weight }) => weight > 0).sort((a, b) => b.weight - a.weight);
  if (positiveLearned.length) parts.push(`来自 ${evidence.feedbackCount} 条历史反馈的「${positiveLearned[0].tag}」偏好提高了排序`);
  if (!place.selectedMatches.length && place.profileMatches.length) parts.push(`延续 ${profile.name} 已积累的「${place.profileMatches[0]}」偏好`);
  if (input.pace === "relaxed") parts.push("步行与停留时长符合松弛节奏");
  if (input.pace === "dense") parts.push("与同区域点位组合，减少空档时间");
  if (evidence.rushedCount > 0 && place.walkingKm <= 1) parts.push("根据“太赶了”的反馈降低了步行负担");
  return `${parts.slice(0, 2).join("；") || "在预算与移动距离约束内得分较高"}。`;
}

function interleaveByArea(scoredPlaces) {
  const buckets = new Map();
  for (const place of scoredPlaces) {
    const entries = buckets.get(place.area) || [];
    entries.push(place);
    buckets.set(place.area, entries);
  }
  const areas = [...buckets.entries()].sort((a, b) => b[1][0].score - a[1][0].score);
  return areas.flatMap(([, entries]) => entries);
}

function allocateDays(places, durationDays, activitiesPerDay) {
  const selectedCount = Math.min(places.length, durationDays * activitiesPerDay);
  const selected = places.slice(0, selectedCount);
  const days = Array.from({ length: durationDays }, () => []);
  let cursor = 0;
  for (let day = 0; day < durationDays; day += 1) {
    const remainingPlaces = selected.length - cursor;
    const remainingDays = durationDays - day;
    const take = Math.min(activitiesPerDay, Math.max(1, Math.ceil(remainingPlaces / remainingDays)));
    days[day] = selected.slice(cursor, cursor + take);
    cursor += take;
  }
  return days;
}

function dayTitle(activities) {
  if (!activities.length) return "自由留白与城市观察";
  const categories = [...new Set(activities.map((activity) => activity.category))];
  return categories.slice(0, 2).join("与");
}

export function generatePlan({ input, profile, evidence, places }) {
  const config = paceConfiguration[input.pace] || paceConfiguration.balanced;
  const scored = places
    .map((place) => scoredPlace(place, input, profile, evidence))
    .sort((a, b) => b.score - a.score || a.priceCents - b.priceCents);
  const ordered = interleaveByArea(scored);
  const allocations = allocateDays(ordered, input.durationDays, config.activitiesPerDay);
  const days = allocations.map((dayPlaces, dayIndex) => {
    const ranges = timeRanges[dayPlaces.length] || timeRanges[3];
    const activities = dayPlaces.map((place, index) => ({
      place,
      score: Number(place.score.toFixed(2)),
      time: ranges[index] || `${9 + index * 3}:00–${11 + index * 3}:00`,
      reason: reasonFor(place, input, profile, evidence)
    }));
    const areas = [...new Set(dayPlaces.map((place) => place.area))];
    return {
      id: dayIndex + 1,
      title: dayTitle(dayPlaces),
      desc: `${areas.slice(0, 2).join("与")}的 ${dayPlaces.map((place) => place.title).join("、")}。`,
      weather: dayPlaces.every((place) => place.isIndoor) ? "室内为主 · 天气友好" : "晴到多云 · 可随天气改线",
      activities
    };
  });
  const activityList = days.flatMap((day) => day.activities);
  const estimatedCostCents = activityList.reduce((sum, activity) => sum + activity.place.priceCents * input.partySize, 0);
  const topSignals = evidence.topLearnedSignals.map(({ tag }) => tag).slice(0, 3);
  const perPersonBudget = input.budget / Math.max(1, input.partySize);
  const budgetBand = perPersonBudget < 1200 ? "节制探索" : perPersonBudget < 3000 ? "均衡体验" : "宽裕体验";
  return {
    engine: "explainable-rules-v1",
    modelUsed: null,
    estimatedCostCents,
    days,
    explanation: {
      profile: profile.name,
      pace: config.label,
      selectedInterests: input.interests,
      feedbackEvidenceCount: evidence.feedbackCount,
      learnedSignals: topSignals,
      budgetBand,
      budgetConstraint: `总预算 ¥${input.budget.toLocaleString("zh-CN")}，${input.partySize} 人`,
      proof: `${profile.name} 的历史反馈权重、当次兴趣、预算和节奏共同参与排序；换旅人或改输入会重新计算。`
    }
  };
}

export function proposeReplan({ itinerary, incident, places, profile, evidence }) {
  const detail = itinerary.dayDetail;
  const original = detail?.nodes?.find((node) => incident === "rain" ? !node.isIndoor : true) || detail?.nodes?.[0];
  if (!original) return null;
  const usedIds = new Set(itinerary.days.flatMap((day) => day.activities || []));
  const incidentRules = {
    rain: (place) => place.isIndoor,
    delay: (place) => place.durationMinutes <= original.durationMinutes || place.walkingKm <= original.walkingKm,
    cancel: () => true,
    traffic: (place) => place.area === original.meta.split(" · ")[0]
  };
  const available = places.filter((place) => place.id !== original.placeId && !usedIds.has(place.title));
  const incidentCandidates = available.filter(incidentRules[incident] || incidentRules.rain);
  const candidates = (incidentCandidates.length ? incidentCandidates : available)
    .map((place) => {
      const tagOverlap = matches(place.tags, original.tags || []).length;
      const profileOverlap = matches(place.tags, profile.interests).length;
      const feedbackScore = place.tags.reduce((sum, tag) => sum + (evidence.tagWeights[tag] || 0), 0);
      return { ...place, replacementScore: tagOverlap * 5 + profileOverlap * 2 + feedbackScore - place.walkingKm };
    })
    .sort((a, b) => b.replacementScore - a.replacementScore || a.priceCents - b.priceCents);
  const replacement = candidates[0];
  if (!replacement) return null;
  const reasons = {
    rain: "保留兴趣匹配，同时优先室内活动并减少天气暴露",
    delay: "缩短活动与移动时间，优先保留当天高偏好节点",
    cancel: "用相近兴趣标签的可用点位替代取消项目",
    traffic: "锁定当前区域，避免把剩余时间消耗在跨区交通上"
  };
  const budgetChangeCents = replacement.priceCents - Math.round((Number(original.meta.match(/¥(\d+)/)?.[1]) || 0) * 100);
  return {
    itineraryId: itinerary.id,
    incident,
    originalActivityId: original.id,
    originalTitle: original.title,
    replacementPlaceId: replacement.id,
    reason: `${reasons[incident] || reasons.rain}；并参考 ${evidence.feedbackCount} 条历史反馈。`,
    timeChange: replacement.durationMinutes <= 90 ? "-20分钟" : "+10分钟",
    budgetChangeCents,
    walking: replacement.walkingKm < original.walkingKm ? `减少 ${(original.walkingKm - replacement.walkingKm).toFixed(1)} km` : `增加 ${(replacement.walkingKm - original.walkingKm).toFixed(1)} km`
  };
}
