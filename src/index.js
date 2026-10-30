import { Hono } from "hono/tiny";
import { getPageHtml } from "./page.js";
import { parseCoords, gcj02ToWgs84, toWgs84, round6, inRange } from "./parse.js";

const app = new Hono();

app.get("/", (c) => {
  // The page is a static template; a short edge/browser cache keeps repeat loads cheap
  // while letting deploys propagate within minutes.
  c.header("Cache-Control", "public, max-age=300");
  return c.html(getPageHtml());
});

// Limits on caller-supplied input. A map share link (even with a pasted place name in
// front of it) is far below 2 KB; anything longer is not a link we can use.
const MAX_PARSE_INPUT = 2048;
const MAX_SEARCH_QUERY = 200;

// Map link parsing: called by the iOS Shortcut and the picker page.
// GET /api/parse?u=<link>&format=json&cs=<gcj|bd|none>
//   Returns {lat, lon, name}. Conversion is dispatched by the detected source: Amap / Apple Maps (GCJ-02 in mainland China) -> WGS84; Baidu (BD09) -> GCJ-02 -> WGS84; HK/Macau/Taiwan and out-of-China points pass through unchanged (they are already WGS84). cs= forces a given system; cs=none forces no conversion.
//   Without format=json it returns a plain-text "lat=..&lon=.." fragment.
app.get("/api/parse", async (c) => {
  const raw = c.req.query("u") || "";
  const cs = (c.req.query("cs") || "").toLowerCase();
  const fmt = (c.req.query("format") || "").toLowerCase();
  if (raw.length > MAX_PARSE_INPUT) {
    c.header("Access-Control-Allow-Origin", "*");
    return c.json({ error: "輸入過長(上限 2KB)" }, 413);
  }
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
  const q = (c.req.query("q") || "").trim().slice(0, MAX_SEARCH_QUERY);
  if (q.length < 2) return c.json({ results: [] });

  const cache = caches.default;
  const cacheKey = new Request(
    `https://wloc.search.cache/?q=${encodeURIComponent(q.toLowerCase())}`
  );
  const cached = await cache.match(cacheKey);
  if (cached) {
    // Return the cached response as-is (no JSON re-parse); add CORS on a mutable copy.
    const res = new Response(cached.body, cached);
    res.headers.set("Access-Control-Allow-Origin", "*");
    return res;
  }

  const api =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(q)}`;
  let raw;
  try {
    const resp = await fetch(api, {
      signal: AbortSignal.timeout(8000),
      headers: {
        // Nominatim's usage policy requires a caller-identifying UA; requests without one get refused.
        "User-Agent": "wloc-ios-place-search/1.0",
        "Accept-Language": "zh-Hant,zh-TW,zh,en",
      },
    });
    if (!resp.ok) return c.json({ results: [], error: "upstream_error" }, 502);
    raw = await resp.json();
  } catch {
    return c.json({ results: [], error: "upstream_error" }, 502);
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
  // Cache only non-empty results: an empty answer may be a transient upstream hiccup,
  // and pinning it for 7 days would hide the place from every later search.
  if (results.length === 0) return c.json(payload);
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
