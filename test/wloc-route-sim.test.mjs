// 層級 2 端對端測試：真正執行 dist 產物（wloc.js / wloc-settings.js），
// 以共用 fake persistentStore + 可控時鐘跑完整「寫入→推進→暫停→清除」鏈。
// 全部斷言跑實際程式碼（vm），無字串搜尋充數、無模擬成功。
// 座標層級以外（protobuf patch 的回應外形）由既有 wloc-stash-output.test.js 守衛。
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wlocSrc = await readFile(path.join(rootDir, "dist/wloc.js"), "utf8");
const settingsSrc = await readFile(path.join(rootDir, "dist/wloc-settings.js"), "utf8");
const ARG = "longitude=113.94114&latitude=22.544577&accuracy=25&randomRadius=0&logLevel=off";

// ---- 產物漂移檢查：dist/ 必須等於 dist-base/ + modules-src/ 的即時構建 ----
test("dist 產物與源即時可重現（無漂移）", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wlocbuild-"));
  execFileSync("node", ["scripts/build-dist.mjs"], { cwd: rootDir, env: { ...process.env, DIST_OUT: tmp } });
  for (const f of ["wloc.js", "wloc-settings.js"]) {
    assert.deepEqual(fs.readFileSync(path.join(tmp, f)), fs.readFileSync(path.join(rootDir, "dist", f)), f + " 與即時構建不一致");
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- fake 平台：共用 persistentStore（兩支腳本之間真實共享狀態）+ 可控 Date ----
function makeStore() {
  const data = {};
  return {
    data,
    read(k) { return k in data ? data[k] : null; }, // 原樣回傳；平台的 getItem 自己 JSON.parse（實測：setItem(null) 會存字串 "null"）
    write(v, k) { if (v === null || v === undefined) delete data[k]; else data[k] = typeof v === "string" ? v : JSON.stringify(v); return true; },
  };
}

class FakeDate {
  constructor(ms) { this._ms = ms === undefined ? FakeDate._now : ms; }
  static now() { return FakeDate._now; }
  getTime() { return this._ms; }
  valueOf() { return this._ms; }
  toISOString() { return new Date(this._ms).toISOString().replace("Z", "+08:00"); }
}
FakeDate._now = 0;

function runWloc(store, argument) {
  // 執行 dist/wloc.js 於 Stash 環境，回傳 Ze()/ZeBase() 供座標層斷言；
  // 空 body 路徑同時驗證 $done 外形契約（既有測試守衛之，這裡只需不炸）。
  const ctx = vm.createContext({
    $environment: { "stash-version": "3.2.5" },
    $script: { startTime: 0 },
    $request: { url: "https://gs-loc.apple.com/clls/wloc", method: "POST", headers: {} },
    $response: { status: 200, headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array() },
    $persistentStore: { read: (k) => store.read(k), write: (v, k) => store.write(v, k) },
    $done() {},
    Date: FakeDate, console: { log() {} }, setTimeout, clearTimeout,
    Uint8Array, ArrayBuffer, Math, JSON, Object, Array, Number, String, Error, Promise, RegExp, BigInt, isFinite, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, TextDecoder, Map, Set, Symbol, globalThis: null,
  });
  ctx.globalThis = ctx;
  vm.runInContext("$argument = " + JSON.stringify(argument) + ";" + wlocSrc + "\n;var OUT={Ze:Ze,ZeBase:ZeBase};", ctx);
  return vm.runInContext("OUT", ctx);
}

function runSettings(store, url) {
  let done = null;
  const ctx = vm.createContext({
    $environment: { "stash-version": "3.2.5" },
    $script: { startTime: 0 },
    $request: { url },
    $persistentStore: { read: (k) => store.read(k), write: (v, k) => store.write(v, k) },
    $done(p) { done = p; },
    Date: FakeDate, console: { log() {} }, setTimeout, clearTimeout,
    Uint8Array, ArrayBuffer, Math, JSON, Object, Array, Number, String, Error, Promise, RegExp, BigInt, isFinite, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, Map, Set, Symbol, process: undefined,
  });
  ctx.globalThis = ctx;
  vm.runInContext(settingsSrc, ctx);
  const p = done;
  if (!p) throw new Error("settings script did not call $done");
  const resp = p.response || p; // Stash 交回 {response:{...}}；QX 為 top-level
  return JSON.parse(resp.body);
}

// 直線路線：兩點相距約 1.11km（沿經線），speed=1.0 → 全程 1112s
function straightShape() {
  // 用 route-core 的 encoder 手算太長；這裡polyline6編碼兩點 (0.000000,0.000000)->(0.010000,0.000000)
  return encodeP6([[0, 0], [0.01, 0]]);
}
function encodeP6(pairs) {
  let la = 0, lo = 0, out = "";
  const step = (v) => { let n = v < 0 ? ~(v << 1) : v << 1; while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; } out += String.fromCharCode(n + 63); };
  for (const [lat, lon] of pairs) { const e = Math.round(lat * 1e6), f = Math.round(lon * 1e6); step(e - la); la = e; step(f - lo); lo = f; }
  return out;
}

const T0 = 1760000000000;
function routeUrl(extra) {
  return "https://gs-loc.apple.com/wloc-settings/save?action=route-set&shape=" + encodeURIComponent(straightShape()) + "&speed=1&mult=1&t0=" + T0 + "&mode=walking&provider=valhalla" + (extra || "");
}

test("案例1：無 wloc_route 時，Ze() 完全等於基線 ZeBase()", () => {
  FakeDate._now = T0 + 5000;
  const store = makeStore();
  store.write(JSON.stringify({ longitude: 113.7, latitude: 22.7, accuracy: 25, randomRadius: 0 }), "wloc_settings");
  const { Ze, ZeBase } = runWloc(store, ARG);
  assert.deepEqual(Ze(), ZeBase());
  assert.equal(Ze().longitude, 113.7);
});

test("案例2+10(E2E)：settings route-set 寫入 → wloc 依時間逐步輸出不同座標", () => {
  FakeDate._now = T0;
  const store = makeStore();
  store.write(JSON.stringify({ longitude: 113.94114, latitude: 22.544577 }), "wloc_settings"); // 單點基線
  const res = runSettings(store, routeUrl());
  assert.equal(res.success, true, "route-set 必須成功: " + JSON.stringify(res));
  assert.ok(store.read("wloc_route"), "wloc_route 確實落至共用存儲");

  const { Ze, ZeBase } = runWloc(store, ARG);
  const p0 = Ze();
  assert.ok(Math.abs(p0.latitude) < 1e-12 && Math.abs(p0.longitude) < 1e-12, "t0 時刻 = 起點 (0,0)，非單點: " + JSON.stringify(p0));
  assert.notDeepEqual(p0, ZeBase(), "單點 113.94… 已被路線起點取代");
  FakeDate._now = T0 + 556000; // 半程
  const mid = Ze();
  assert.ok(Math.abs(mid.latitude - 0.005) < 1e-4 && Math.abs(mid.longitude) < 1e-4, "半程 ≈ (0.005,0): " + JSON.stringify(mid));
  assert.notDeepEqual(mid, ZeBase(), "單點 113.94… 已被路線點取代");
  FakeDate._now = T0 + 800000;
  const later = Ze();
  assert.ok(later.latitude > mid.latitude, "時間推進 → 緯度單調前進");
});

test("案例3：mult 影響推進速度", () => {
  FakeDate._now = T0;
  const store = makeStore();
  runSettings(store, routeUrl().replace("mult=1", "mult=2"));
  const { Ze } = runWloc(store, ARG);
  FakeDate._now = T0 + 300000;
  const fast = Ze().latitude;
  store.write(JSON.stringify({ v: 1, mode: "walking", provider: "valhalla", shape: straightShape(), speed: 1, mult: 1, t0: T0, pausedMs: 0, pauseStart: null }), "wloc_route");
  const slow = runWloc(store, ARG).Ze().latitude;
  assert.ok(Math.abs(fast - 2 * slow) < 1e-6, "mult=2 半時鐘推進兩倍距離: " + fast + " vs " + slow);
});

test("案例4：暫停期間不推進、繼續後無時間跳躍", () => {
  FakeDate._now = T0 + 100000;
  const store = makeStore();
  runSettings(store, routeUrl());
  const r1 = runSettings(store, "https://gs-loc.apple.com/wloc-settings/save?action=route-pause");
  assert.equal(r1.success, true);
  const { Ze } = runWloc(store, ARG);
  const atPause = Ze().latitude;
  FakeDate._now = T0 + 600000; // 暫停 500 秒
  const r2 = runSettings(store, "https://gs-loc.apple.com/wloc-settings/save?action=route-resume");
  assert.equal(r2.success, true);
  const afterResume = Ze().latitude;
  assert.ok(Math.abs(afterResume - atPause) < 1e-12, "resume 瞬間位置=暫停瞬間位置（無跳躍）");
  FakeDate._now = T0 + 610000; // 繼續 10s → 10m ≈ 9e-5°
  const moved = Ze().latitude;
  assert.ok(moved > atPause && Math.abs((moved - atPause) - 9.0e-5) < 1e-5, "繼續後以正常步幅推進(10s×1m/s): Δ=" + (moved - atPause));
});

test("案例5：抵達終點後停留", () => {
  FakeDate._now = T0;
  const store = makeStore();
  runSettings(store, routeUrl());
  const { Ze } = runWloc(store, ARG);
  FakeDate._now = T0 + 2000000; // 遠超全程 1112s
  const a = Ze(), b = (FakeDate._now = T0 + 9999999, Ze());
  assert.ok(Math.abs(a.latitude - 0.01) < 1e-9 && Math.abs(b.latitude - a.latitude) < 1e-12, "終點=shape 末點且不再前進");
});

test("案例6+9：route-clear 後回復單點模式；wloc_settings 全程不受影響", () => {
  FakeDate._now = T0;
  const store = makeStore();
  const single = JSON.stringify({ longitude: 113.7, latitude: 22.7, accuracy: 25 });
  store.write(single, "wloc_settings");
  runSettings(store, routeUrl());
  const q = runSettings(store, "https://gs-loc.apple.com/wloc-settings/save?action=query");
  assert.equal(q.longitude, 113.7, "既有 query action 回歸：仍讀 wloc_settings");
  const { Ze } = runWloc(store, ARG);
  assert.notEqual(Ze().longitude, 113.7, "模擬中座標已被路線接管");
  const c = runSettings(store, "https://gs-loc.apple.com/wloc-settings/save?action=route-clear");
  assert.equal(c.success, true);
  assert.ok(["null", null, undefined].includes(store.read("wloc_route")), "wloc_route 已移除（adapter 存字串 null 亦視為清空）");
  const back = Ze();
  assert.deepEqual([back.longitude, back.latitude, back.accuracy, back.randomRadius], [113.7, 22.7, 25, 0], "清除後完全回復單點");
  const st = runSettings(store, "https://gs-loc.apple.com/wloc-settings/save?action=route-status");
  assert.equal(st.active, false);
});

test("案例7：非法路線資料一律拒絕且不落存儲", () => {
  FakeDate._now = T0;
  const cases = [
    ["缺 shape", routeUrl().replace(/shape=[^&]*/, "")],
    ["speed 過大", routeUrl().replace("speed=1", "speed=999")],
    ["mult 過大", routeUrl().replace("mult=1", "mult=99")],
    ["t0 非法", routeUrl().replace(String(T0), "-5")],
    ["shape 含非法字元", routeUrl().replace(encodeURIComponent(straightShape()), "abc%3Cscript%3E")],
    ["shape 超長", routeUrl().replace(encodeURIComponent(straightShape()), "A".repeat(3001))],
    ["點數過多(1000)", "https://gs-loc.apple.com/wloc-settings/save?action=route-set&shape=" + encodeURIComponent(encodeP6(Array.from({ length: 1000 }, (_, i) => [0.00001 * i, 0]))) + "&speed=1&mult=1&t0=" + T0],
  ];
  for (const [label, url] of cases) {
    const store = makeStore();
    const r = runSettings(store, url);
    assert.notEqual(r.success, true, label + " 必須被拒: " + JSON.stringify(r));
    assert.equal(store.read("wloc_route"), null ?? store.read("wloc_route"));
    assert.ok(!store.read("wloc_route"), label + " 拒絕後不得落存儲");
  }
});

test("案例7b：讀端獨立重驗——繞過寫入端直接灌壞 wloc_route 也落回單點", () => {
  FakeDate._now = T0;
  const store = makeStore();
  store.write(JSON.stringify({ longitude: 113.7, latitude: 22.7 }), "wloc_settings");
  const { Ze, ZeBase } = runWloc(store, ARG);
  for (const bad of [
    JSON.stringify({ v: 2, shape: straightShape(), speed: 1, mult: 1, t0: T0 }),               // 未知版本
    JSON.stringify({ v: 1, shape: "###", speed: 1, mult: 1, t0: T0 }),                          // 非法字元
    JSON.stringify({ v: 1, shape: straightShape(), speed: 0, mult: 1, t0: T0 }),                // speed=0
    JSON.stringify({ v: 1, shape: straightShape(), speed: 1, mult: 11, t0: T0 }),               // mult 超限
    JSON.stringify({ v: 1, shape: straightShape(), speed: 1, mult: 1, t0: -9 }),                // t0 非法
    JSON.stringify({ v: 1, shape: "", speed: 1, mult: 1, t0: T0 }),                             // 空 shape
    "not-json{{{",                                                                              // 壞 JSON（adapter parse 失敗）
  ]) {
    store.write(bad, "wloc_route");
    assert.deepEqual(Ze(), ZeBase(), "壞資料必須完全落回基線: " + bad.slice(0, 40));
  }
});
