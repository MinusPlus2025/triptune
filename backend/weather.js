const positions = {北京:[39.9042,116.4074],上海:[31.2304,121.4737],杭州:[30.2741,120.1551],成都:[30.5728,104.0668],广州:[23.1291,113.2644],南京:[32.0603,118.7969]};
import https from "node:https";
const cache = new Map();
function fetchAmap(url) {
  return new Promise((resolve,reject) => {
    const request = https.get(url,{family:4},response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data",chunk => { body += chunk; if (body.length>65536) request.destroy(new Error("Response too large")); });
      response.on("error",reject);
      response.on("end",()=> {
        if (response.statusCode!==200) return reject(new Error(`AMAP_HTTP_${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error("AMAP_DATA_INVALID")); }
      });
    });
    const timer = setTimeout(()=>request.destroy(Object.assign(new Error("Timeout"),{name:"TimeoutError"})),6000);
    request.on("close",()=>clearTimeout(timer));
    request.on("error",reject);
  });
}
const pending = new Map();
const adcodes = {北京:"110000",上海:"310000",杭州:"330100",成都:"510100",广州:"440100",南京:"320100"};
async function getAmapWeather(city) {
  const url = new URL("https://restapi.amap.com/v3/weather/weatherInfo");
  url.search = new URLSearchParams({key:process.env.AMAP_API_KEY.trim(),city:adcodes[city],extensions:"base",output:"JSON"});
  const data = await fetchAmap(url);
  if (data.status !== "1") {
    const code = /^\d{5}$/.test(data.infocode) ? data.infocode : "unknown";
    throw new Error(`AMAP_API_${code}`);
  }
  const live = data.lives?.[0];
  const temperature = Number(live?.temperature);
  const time = live?.reporttime?.replace(" ","T");
  const observed = Date.parse(`${time}+08:00`);
  if (!live || live.temperature == null || live.temperature === "" || !Number.isFinite(temperature) || !Number.isFinite(observed)) throw new Error("AMAP_DATA_INVALID");
  if (Math.abs(Date.now()-observed)>3*3600000) throw new Error("AMAP_DATA_STALE");
  const description = live.weather || "";
  const code = /雪/.test(description) ? 73 : /雨|雷/.test(description) ? 61 : /雾|霾|沙|尘/.test(description) ? 45 : /阴/.test(description) ? 3 : /云/.test(description) ? 2 : description === "晴" ? 0 : null;
  if (code === null) throw new Error("AMAP_WEATHER_UNKNOWN");
  // Approximate daylight is only used for the decorative sky, not weather data.
  const hour = Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
  return {city,current:{temperature_2m:temperature,weather_code:code,is_day:Number(hour>=6 && hour<18),time},source:"高德天气",fetchedAt:Date.now()};
}
export async function getWeather(city) {
  if (!Object.hasOwn(positions, city)) throw new Error("不支持的目的地");
  const saved = cache.get(city);
  if (saved && Date.now() - saved.fetchedAt < 600000) return saved;
  if (pending.has(city)) return pending.get(city);
  const job = (async () => {
    const [latitude,longitude] = positions[city];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (process.env.AMAP_API_KEY?.trim()) {
          const result = await getAmapWeather(city);
          cache.set(city,result);
          return result;
        }
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
      } catch (error) {
        if (attempt === 1) {
          const reason = /^AMAP_(API_\d{5}|API_unknown|HTTP_\d{3}|DATA_INVALID|DATA_STALE|WEATHER_UNKNOWN)$/.test(error.message) ? error.message : error.name === "TimeoutError" ? "TIMEOUT" : "WEATHER_REQUEST_FAILED";
          console.warn("[weather]", process.env.AMAP_API_KEY?.trim() ? "amap" : "open-meteo", reason);
          const safeCode = /^[A-Z_]{2,50}$/.test(error.cause?.code || "") ? error.cause.code : "none";
          console.warn("[weather]", "error-type", ["TypeError","SyntaxError","Error"].includes(error.name) ? error.name : "other", "network-code", safeCode);
          throw error;
        }
      }
    }
  })();
  pending.set(city,job);
  try { return await job; } finally { pending.delete(city); }
}
