const positions = {北京:[39.9042,116.4074],上海:[31.2304,121.4737],杭州:[30.2741,120.1551],成都:[30.5728,104.0668],广州:[23.1291,113.2644],南京:[32.0603,118.7969]};
const cache = new Map();
const pending = new Map();
export async function getWeather(city) {
  if (!Object.hasOwn(positions, city)) throw new Error("不支持的目的地");
  const saved = cache.get(city);
  if (saved && Date.now() - saved.fetchedAt < 600000) return saved;
  if (pending.has(city)) return pending.get(city);
  const job = (async () => {
    const [latitude,longitude] = positions[city];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.search = new URLSearchParams({latitude,longitude,current:"temperature_2m,weather_code,is_day",timezone:"Asia/Shanghai"});
        const response = await fetch(url, {signal:AbortSignal.timeout(6000)});
        if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
        const {current} = await response.json();
        const observed = Date.parse(`${current?.time}+08:00`);
        if (!Number.isFinite(current?.temperature_2m) || !Number.isInteger(current?.weather_code) || ![0,1].includes(current?.is_day) || !Number.isFinite(observed) || Math.abs(Date.now()-observed) > 3*3600000) throw new Error("天气数据过期或不完整");
        const result = {city,current,source:"Open-Meteo",fetchedAt:Date.now()};
        cache.set(city,result);
        return result;
      } catch (error) { if (attempt === 1) throw error; }
    }
  })();
  pending.set(city,job);
  try { return await job; } finally { pending.delete(city); }
}
