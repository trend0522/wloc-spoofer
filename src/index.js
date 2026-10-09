import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, toWgs84, round6, inRange } from "./parse.js";

const app = new Hono();

/* ---- P0 abuse throttle: per-IP fixed window, isolate-local ----
   ponytail: a Map in module scope, NOT KV — KV needs a namespace + wrangler binding (deploy-config change).
   Ceiling: each Worker isolate counts its own traffic; a cold start resets it. Good enough to stop
   dictionary-flooding Nominatim / parse-proxy abuse from one client; not a distributed quota,
   NOT an upstream-policy (1 req/s Nominatim) guarantee.
   Upgrade path for real compliance: Durable Object token bucket (strongly consistent across isolates). */
const rlWindows = new Map();
const RL_MAX_KEYS = 5000;
function rlEvict(now, windowMs) {
  if (rlWindows.size < RL_MAX_KEYS) return;
  // Pass 1: drop expired windows — free space without touching anyone's live quota.
  for (const [k, t] of rlWindows) if (now - t.start >= windowMs) rlWindows.delete(k);
  if (rlWindows.size < RL_MAX_KEYS) return;
  // Pass 2 (full-load policy, deliberate): evict the oldest quarter by window start.
  // Bounded, defined damage — unlike rlWindows.clear(), an IP-rotating flood cannot
  // reset every user's quota in one shot; survivors keep counting.
  const cut = rlWindows.size >> 2;
  for (const [k] of [...rlWindows.entries()].sort((a, b) => a[1].start - b[1].start).slice(0, cut)) rlWindows.delete(k);
}
function rateLimited(key, max, windowMs, now) {
  rlEvict(now, windowMs);
  const t = rlWindows.get(key);
  if (!t || now - t.start >= windowMs) { rlWindows.set(key, { start: now, n: 1 }); return false; }
  t.n++;
  return t.n > max;
}
const rlNow = () => Date.now();
const RL_SEARCH_MAX = 20, RL_PARSE_MAX = 20, RL_WINDOW_MS = 60000; // per minute per IP
export { rateLimited, rlWindows }; // for throttle unit tests only; Worker entry stays `export default app`

app.get("/", (c) => {
  return c.html(getPageHtml());
});

// Map link parsing: called by the iOS Shortcut and the picker page.
// GET /api/parse?u=<link>&format=json&cs=<gcj|bd|none>
//   Returns {lat, lon, name}. Conversion is dispatched by the detected source: Amap / Apple Maps (GCJ-02 in mainland China) -> WGS84; Baidu (BD09) -> GCJ-02 -> WGS84; HK/Macau/Taiwan and out-of-China points pass through unchanged (they are already WGS84). cs= forces a given system; cs=none forces no conversion.
//   Without format=json it returns a plain-text "lat=..&lon=.." fragment.
app.get("/api/parse", async (c) => {
  const ip = (c.req.raw.cf && c.req.raw.cf.ip) || c.req.header("x-forwarded-for") || "unknown";
  if (rateLimited("p:" + ip, RL_PARSE_MAX, RL_WINDOW_MS, rlNow())) {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Retry-After", "60");
    return c.json({ error: "請求過頻，請一分鐘後再試" }, 429);
  }
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  try {
    let { lat, lon, name, src } = await parseCoords(raw);
    // Default: convert by detected source. cs=none forces no conversion, cs=gcj/bd forces one.
    if (cs === "gcj") ({ lat, lon } = gcj02ToWgs84(lat, lon));
    else if (cs === "bd") ({ lat, lon } = toWgs84(lat, lon, "baidu"));
    else if (cs !== "none") ({ lat, lon } = toWgs84(lat, lon, src));
    // Validate once more on the way out: cs= is caller-supplied, and forcing the
    // wrong system can push the value out of range. Better to error than to hand
    // back a number a Shortcut could write into the device as a coordinate.
    if (!inRange(lat, lon)) throw new Error("解析出的座標超出合法範圍");
    lat = round6(lat);
    lon = round6(lon);
    name = name || "";
    c.header("Access-Control-Allow-Origin", "*");
    if (fmt === "json") return c.json({ lat, lon, name });
    return c.text(`lat=${lat}&lon=${lon}`);
  } catch (e) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: String(e && e.message ? e.message : e) }, 422);
  }
});

// Global place search for the picker page's search box.
// GET /api/search?q=<keyword>
//   Proxies OpenStreetMap Nominatim and returns {results:[{name, detail, lat, lon}]} (all WGS-84).
//   Served through the Cloudflare Cache API with a 7-day edge TTL: place names rarely change, so
//   repeat queries never hit origin — fast, and it avoids browsers calling Nominatim directly
//   (rate limits + usage policy).
app.get("/api/search", async (c) => {
  c.header("Access-Control-Allow-Origin", "*");
  const q = (c.req.query("q") || "").trim();
  if (q.length < 2) return c.json({ results: [] });

  const cache = caches.default;
  const cacheKey = new Request(
    `https://wloc.search.cache/?q=${encodeURIComponent(q.toLowerCase())}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) return c.json(await cached.json());

  // Past cache-miss = this request will hit Nominatim → throttle egress only.
  const ip = (c.req.raw.cf && c.req.raw.cf.ip) || c.req.header("x-forwarded-for") || "unknown";
  if (rateLimited("s:" + ip, RL_SEARCH_MAX, RL_WINDOW_MS, rlNow())) {
    c.header("Retry-After", "60");
    return c.json({ results: [], limited: true }); // 契約不變：仍 200 + {results:[]}
  }

  const api =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(q)}`;
  let raw;
  try {
    const resp = await fetch(api, {
      headers: {
        // Nominatim's usage policy requires a caller-identifying UA; requests without one get refused.
        "User-Agent": "wloc-ios-place-search/1.0",
        "Accept-Language": "zh-Hant,zh-TW,zh,en",
      },
      // Hang prevention: Nominatim slow = whole Worker slow. Fallback shape unchanged ({results:[]}).
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return c.json({ results: [] });
    raw = await resp.json();
  } catch {
    return c.json({ results: [] });
  }

  const results = (Array.isArray(raw) ? raw : [])
    .map((r) => ({
      name: r.name || String(r.display_name || "").split(",")[0].trim(),
      detail: r.display_name || "",
      lat: Number(r.lat),
      lon: Number(r.lon),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));

  const payload = { results };
  // Store a TTL'd copy; waitUntil does not block this response.
  c.executionCtx.waitUntil(
    cache.put(
      cacheKey,
      new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "max-age=604800",
        },
      })
    )
  );
  return c.json(payload);
});

// The fallback 500 must also carry CORS — otherwise the Shortcut sees a cross-origin
// error instead of the real cause.
app.onError((e, c) => {
  console.error(`${e}`);
  c.header("Access-Control-Allow-Origin", "*");
  return c.text(`${e && e.message ? e.message : e}`, 500);
});

export default app;
