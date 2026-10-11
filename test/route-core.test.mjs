// route-core 的 vm 級測試：把注入瀏覽器的同一份字串原樣跑在 vm 裡。
// 覆蓋：座標解析、polyline 解碼、距離/插值、三模式真實 costing、
// 錯誤分類（154→TOO_FAR、442→NO_ROUTE、429/5xx→SERVICE、401→BAD_KEY）、
// 重試策略（NET/SERVICE 自動重一次、確定性 4xx 不重打公共服務）、超時信號。
// 對照基準為 2026-10-11 實測：Valhalla 公共服務 22/22 全 200、400 錯誤也帶
// access-control-allow-origin:*（CORS 不是失敗原因）、preflight 204 通過。
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 直接 import 匯出的常量——那是模板字串「求值後」的內容，與頁面 ${ROUTE_CORE_JS}
// 注入、瀏覽器實際執行之物完全一致（源檔文字中的 \\s 求值後才是 \s）。
const { ROUTE_CORE_JS } = await import(path.join(rootDir, "src/route-core.js"));
if (!ROUTE_CORE_JS.includes('function fetchRoute')) throw new Error('ROUTE_CORE_JS 匯出異常');

function core(opts = {}) {
  const calls = [];
  const ctx = {
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (opts.fetchImpl) return opts.fetchImpl(String(url), init, calls.length);
      throw new Error('NO_FETCH_STUB');
    },
    setTimeout, Promise, Math, Number, Array, JSON, encodeURIComponent, Error, Object, String, isFinite, RegExp,
    AbortSignal: { timeout: (ms) => ({ __timeout: ms }) },
  };
  vm.createContext(ctx);
  vm.runInContext(ROUTE_CORE_JS + "\n;var OUT={ROUTE_MODES,parseLatLngText,decodePolyline,havMeters,routeCumulative,routePositionAt,valhallaRouteBody,mapboxDirectionsUrl,fetchRoute};", ctx);
  return { fns: vm.runInContext("OUT", ctx), calls };
}

test("parseLatLngText: 逗號/空格/分號皆可、範圍驗證", () => {
  const { fns } = core();
  assert.deepEqual([fns.parseLatLngText("25.048, 121.517").lat, fns.parseLatLngText("25.048, 121.517").lon], [25.048, 121.517]);
  assert.ok(fns.parseLatLngText("25.048 121.517"));
  assert.ok(fns.parseLatLngText("25.048;121.517"));
  assert.equal(fns.parseLatLngText("91, 121"), null);
  assert.equal(fns.parseLatLngText("25, 181"), null);
  assert.equal(fns.parseLatLngText("25"), null);
  assert.equal(fns.parseLatLngText("abc, def"), null);
  assert.equal(fns.parseLatLngText(""), null);
});

test("decodePolyline: round-trip 對已知折線逐點還原 (polyline6)", () => {
  const { fns } = core();
  const ref = [[25.048000,121.517000],[25.040123,121.530456],[25.033900,121.564500]];
  const pts = fns.decodePolyline(encodeFake(ref), 1e6);
  assert.equal(pts.length, 3);
  ref.forEach((p, i) => {
    assert.ok(Math.abs(pts[i].lat - p[0]) < 1e-9 && Math.abs(pts[i].lon - p[1]) < 1e-9, 'pt' + i);
  });
});

test("routeCumulative + routePositionAt: 直線插值與兩端鉗制", () => {
  const { fns } = core();
  const coords = [ { lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 } ];
  const cum = fns.routeCumulative(coords);
  const total = cum[cum.length - 1];
  assert.ok(total > 222000 && total < 223000); // 2×1° 經度赤道 ≈ 222.4km
  const mid = fns.routePositionAt(coords, cum, total / 2);
  assert.ok(Math.abs(mid.lat) < 1e-9 && Math.abs(mid.lon - 1) < 1e-6);
  assert.deepEqual([fns.routePositionAt(coords, cum, -5).lat, fns.routePositionAt(coords, cum, -5).lon], [0, 0]);
  assert.deepEqual([fns.routePositionAt(coords, cum, total + 999).lat, fns.routePositionAt(coords, cum, total + 999).lon], [0, 2]);
});

test("valhallaRouteBody: 三模式對映真實 costing（不是換標籤）", () => {
  const { fns } = core();
  assert.equal(fns.valhallaRouteBody("walking", {lat:1,lon:2},{lat:3,lon:4}).costing, "pedestrian");
  assert.equal(fns.valhallaRouteBody("biking", {lat:1,lon:2},{lat:3,lon:4}).costing, "bicycle");
  assert.equal(fns.valhallaRouteBody("driving", {lat:1,lon:2},{lat:3,lon:4}).costing, "auto");
});

test("fetchRoute valhalla 成功: POST 結構、shape 解析、20s 超時信號", async () => {
  const ok = { ok: true, status: 200, json: async () => ({ trip: { summary: { length: 6.426, time: 1421.098 }, shape: encodeFake([[25.048,121.517],[25.0339,121.5645]]) } }) };
  const { fns, calls } = core({ fetchImpl: () => ok });
  const r = await fns.fetchRoute({ provider: "valhalla", mode: "biking", from: {lat:25.048,lon:121.517}, to: {lat:25.0339,lon:121.5645} });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("valhalla1.openstreetmap.de/route"));
  assert.equal(calls[0].init.method, "POST");
  assert.equal(JSON.parse(calls[0].init.body).costing, "bicycle");
  assert.equal(calls[0].init.signal.__timeout, 20000);
  assert.equal(Math.round(r.distance_m), 6426);
  assert.equal(Math.round(r.duration_s), 1421);
});

test("錯誤分類：154→TOO_FAR、442→NO_ROUTE；確定性 400 不重試（各只打一次）", async () => {
  const mk = (code) => ({ ok: false, status: 400, json: async () => ({ error_code: code, status_code: 400 }) });
  for (const [code, want] of [[154, 'TOO_FAR'], [442, 'NO_ROUTE']]) {
    const { fns, calls } = core({ fetchImpl: () => mk(code) });
    await assert.rejects(fns.fetchRoute({ provider: "valhalla", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2} }), new RegExp(want));
    assert.equal(calls.length, 1, 'error_code ' + code + ' 不應重試');
  }
});

test("錯誤分類：503/429→SERVICE 且自動重試一次；第二次成功即返回", async () => {
  const { fns, calls } = core({ fetchImpl: (u, init, n) =>
    n === 1 ? { ok: false, status: 503, json: async () => ({}) }
            : { ok: true, status: 200, json: async () => ({ trip: { summary: { length: 1, time: 60 }, shape: encodeFake([[1,1],[1.001,1.001]]) } }) } });
  const r = await fns.fetchRoute({ provider: "valhalla", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2} });
  assert.equal(calls.length, 2, "5xx 重試一次並成功");
  assert.ok(r.coords.length >= 2);
  const { fns: f2, calls: c2 } = core({ fetchImpl: () => ({ ok: false, status: 429, json: async () => ({ error_code: 10, status_code: 429 }) }) });
  await assert.rejects(f2.fetchRoute({ provider: "valhalla", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2} }), /SERVICE/);
  assert.equal(c2.length, 2, "429 重試一次後才報錯");
});

test("錯誤分類：TypeError(連不到/CORS)→NET 並重試一次；Mapbox 401→BAD_KEY 不重試", async () => {
  const { fns, calls } = core({ fetchImpl: () => { const e = new Error('Failed to fetch'); e.name = 'TypeError'; throw e; } });
  await assert.rejects(fns.fetchRoute({ provider: "valhalla", mode: "driving", from: {lat:1,lon:1}, to: {lat:2,lon:2} }), /NET/);
  assert.equal(calls.length, 2, "NET 重試一次");
  const { fns: f2, calls: c2 } = core({ fetchImpl: () => ({ ok: false, status: 401, json: async () => ({ message: "Not Authorized - Invalid Token" }) }) });
  await assert.rejects(f2.fetchRoute({ provider: "mapbox", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2}, key: "pk.bad" }), /BAD_KEY/);
  assert.equal(c2.length, 1, "壞鑰屬確定性錯誤，不重打");
});

test("fetchRoute mapbox: cycling profile、key URL 編碼、Ok 解析；無鑰 NEED_KEY", async () => {
  const { fns, calls } = core({ fetchImpl: () => ({ ok: true, status: 200, json: async () => ({ code: "Ok", routes: [{ distance: 1500.5, duration: 300, geometry: { coordinates: [[121.5,25.0],[121.51,25.01]] } }] }) }) });
  const r = await fns.fetchRoute({ provider: "mapbox", mode: "biking", from: {lat:25.0,lon:121.5}, to: {lat:25.01,lon:121.51}, key: "pk.abc/def" });
  assert.ok(calls[0].url.includes("/directions/v5/mapbox/cycling/"));
  assert.ok(calls[0].url.includes("access_token=pk.abc%2Fdef"));
  assert.deepEqual([r.coords[1].lat, r.coords[1].lon], [25.01, 121.51]);
  assert.equal(r.distance_m, 1500.5);
  const { fns: f2 } = core();
  await assert.rejects(f2.fetchRoute({ provider: "mapbox", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2} }), /NEED_KEY/);
});

test("fetchRoute mapbox: NoRoute→NO_ROUTE；Ok 但 routes 空→SERVICE", async () => {
  const { fns } = core({ fetchImpl: () => ({ ok: true, status: 200, json: async () => ({ code: "NoRoute", routes: [] }) }) });
  await assert.rejects(fns.fetchRoute({ provider: "mapbox", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2}, key: "k" }), /NO_ROUTE/);
  const { fns: f2 } = core({ fetchImpl: () => ({ ok: true, status: 200, json: async () => ({ code: "Ok", routes: [] }) }) });
  await assert.rejects(f2.fetchRoute({ provider: "mapbox", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2}, key: "k" }), /SERVICE/);
});

test("valhalla 回 200 但 JSON 壞→SERVICE（可重試），二次仍壞才報錯", async () => {
  const { fns, calls } = core({ fetchImpl: () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) });
  // json() throws SyntaxError — parse catch converts to classified SERVICE via !r.ok? no: r.ok → 'SERVICE'
  await assert.rejects(fns.fetchRoute({ provider: "valhalla", mode: "walking", from: {lat:1,lon:1}, to: {lat:2,lon:2} }), /SERVICE/);
  assert.equal(calls.length, 2);
});

// polyline 編碼器（測試用，polyline6）
function encodeFake(pairs) {
  let lastLat = 0, lastLon = 0, out = "";
  const step = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
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
