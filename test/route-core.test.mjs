// route-core 的 vm 級測試：把注入瀏覽器的同一份字串原樣跑在 vm 裡，
// 覆蓋 polyline 解碼、累積距離/插值、三種 provider 的請求构造與回包解析。
// 座標點為實測過的台北車站→台北101 步行路線片段（Valhalla 公共服務）。
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = await readFile(path.join(rootDir, "src/route-core.js"), "utf8");
// 抽出模板字串內容（與部署後瀏覽器實際執行之物一致）
const ROUTE_CORE_JS = src.match(/export const ROUTE_CORE_JS = `([\s\S]*)`;\s*$/)[1];

function core(fetchImpl) {
  const ctx = { fetch: fetchImpl, Promise, Math, Number, Array, JSON, encodeURIComponent, Error, Object, typeof_ : undefined };
  vm.createContext(ctx);
  vm.runInContext(ROUTE_CORE_JS + "\n;({ROUTE_MODES, decodePolyline, havMeters, routeCumulative, routePositionAt, valhallaRouteBody, mapboxDirectionsUrl, maptilerDirectionsUrl, parseRouteResponse, fetchRoute})", ctx);
  return vm.runInContext("({ROUTE_MODES, decodePolyline, havMeters, routeCumulative, routePositionAt, valhallaRouteBody, mapboxDirectionsUrl, maptilerDirectionsUrl, parseRouteResponse, fetchRoute})", ctx);
}

test("decodePolyline: round-trip 對已知折線逐點還原 (polyline6)", () => {
  const c = core();
  const ref = [[25.048000,121.517000],[25.040123,121.530456],[25.033900,121.564500]];
  const enc = encodeFake(ref); // 測試內 encoder：polyline6
  const pts = c.decodePolyline(enc, 1e6);
  assert.equal(pts.length, 3);
  ref.forEach((p, i) => {
    assert.ok(Math.abs(pts[i].lat - p[0]) < 1e-9 && Math.abs(pts[i].lon - p[1]) < 1e-9, 'pt' + i);
  });
});

test("routeCumulative + routePositionAt: 直線三等分插值", () => {
  const c = core();
  const coords = [ { lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 } ];
  const cum = c.routeCumulative(coords);
  const total = cum[cum.length - 1];
  assert.ok(total > 222000 && total < 223000); // 2×1° 經度赤道 ≈ 222.4km
  const mid = c.routePositionAt(coords, cum, total / 2);
  assert.ok(Math.abs(mid.lat) < 1e-9);
  assert.ok(Math.abs(mid.lon - 1) < 1e-6);
  assert.deepEqual(c.routePositionAt(coords, cum, -5), coords[0]);
  assert.deepEqual(c.routePositionAt(coords, cum, total + 999), coords[2]);
});

test("valhallaRouteBody: 三模式對映真實 costing（不是換標籤）", () => {
  const c = core();
  assert.equal(c.valhallaRouteBody("walking", {lat:1,lon:2},{lat:3,lon:4}).costing, "pedestrian");
  assert.equal(c.valhallaRouteBody("biking", {lat:1,lon:2},{lat:3,lon:4}).costing, "bicycle");
  assert.equal(c.valhallaRouteBody("driving", {lat:1,lon:2},{lat:3,lon:4}).costing, "auto");
});

test("fetchRoute valhalla: POST 結構與回包解析(shape→coords/距離/時間)", async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    // 合成 polyline6：兩點 (25.048,121.517)->(25.0339,121.5645)
    return { ok: true, json: async () => ({ trip: { summary: { length: 6.426, time: 1421.098 }, shape: encodeFake([ [25.048,121.517],[25.0339,121.5645] ]) } }) };
  };
  const c = core(fakeFetch);
  const r = await c.fetchRoute({ provider: "valhalla", mode: "biking", from: {lat:25.048,lon:121.517}, to: {lat:25.0339,lon:121.5645} });
  assert.ok(seen.url.includes("valhalla1.openstreetmap.de/route"));
  assert.equal(JSON.parse(seen.init.body).costing, "bicycle");
  assert.equal(r.coords.length, 2);
  assert.equal(Math.round(r.distance_m), 6426);
  assert.equal(Math.round(r.duration_s), 1421);
});

test("fetchRoute mapbox: profile 對映 + geojson [lon,lat] 解析 + key 編碼", async () => {
  let url;
  const fakeFetch = async (u) => {
    url = u;
    return { ok: true, json: async () => ({ routes: [{ distance: 1500.5, duration: 300, geometry: { coordinates: [[121.5,25.0],[121.51,25.01]] } }] }) };
  };
  const c = core(fakeFetch);
  const r = await c.fetchRoute({ provider: "mapbox", mode: "walking", from: {lat:25.0,lon:121.5}, to: {lat:25.01,lon:121.51}, key: "pk.abc/def" });
  assert.ok(url.includes("/directions/v5/mapbox/walking/"));
  assert.ok(url.includes("access_token=pk.abc%2Fdef"));
  assert.deepEqual([r.coords[1].lat, r.coords[1].lon], [25.01, 121.51]);
  assert.equal(r.distance_m, 1500.5);
});

test("fetchRoute maptiler: cycling profile；無 key 時 NEED_KEY；NoRoute→NO_ROUTE", async () => {
  let url;
  const fakeFetch = async (u) => { url = u; return { ok: true, json: async () => ({ code: "NoRoute", routes: [] }) }; };
  const c = core(fakeFetch);
  await assert.rejects(c.fetchRoute({ provider: "maptiler", mode: "biking", from: {lat:1,lon:1}, to: {lat:2,lon:2} }), /NEED_KEY/);
  await assert.rejects(c.fetchRoute({ provider: "maptiler", mode: "biking", from: {lat:1,lon:1}, to: {lat:2,lon:2}, key: "k1" }), /NO_ROUTE/);
  assert.ok(url.includes("/directions/cycling/"));
});

// polyline 編碼器（測試用，polyline6）
function encodeFake(pairs) {
  let lastLat = 0, lastLon = 0, out = "";
  const step = (v) => {
    let n = v < 0 ? ~ (v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lon] of pairs) {
    const e6 = (x) => Math.round(x * 1e6);
    out += step(e6(lat) - lastLat); lastLat = e6(lat);
    out += step(e6(lon) - lastLon); lastLon = e6(lon);
  }
  return out;
}
