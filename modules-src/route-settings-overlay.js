// 層級 2 路線模擬 overlay（寫入端）——錨點注入 dist/wloc-settings.js。
// 由 scripts/build-dist.mjs 注入。新 action 全部走 route-* 前綴，
// 不觸碰既有 query/clear/save 的 wloc_settings 五欄路徑。
//
// 契約（docs/route-simulation-level2-plan.md §3.2）：
//   ?action=route-set&shape=<p6>&speed=1.4&mult=1&t0=<ms>&mode=walking&provider=valhalla
//   ?action=route-pause / route-resume / route-clear / route-status
// 讀端（dist/wloc.js）對欄位再驗證；這裡的驗證是第一道（信任邊界=使用者輸入）。

var WLOC_ROUTE_KEY = "wloc_route";

// polyline6 解碼計點（寫入端第一道；截斷/超點數回 null）
function wlocRouteCountPoints(str) {
  var count = 0, index = 0, lat = 0, lon = 0, len = str.length;
  while (index < len) {
    var b, shift = 0, result = 0;
    do { if (index >= len) return null; b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    if (Math.abs(lat) > 90000000) return null;
    shift = 0; result = 0;
    do { if (index >= len) return null; b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    if (Math.abs(lon) > 180000000) return null;
    count++;
    if (count > 800) return null;
  }
  return count >= 2 ? count : null;
}

function wlocRouteValidate(params) {
  var shape = params.get("shape") || "";
  // Google polyline 字元集=ASCII 0x3F–0x7E；& = # 不在其中，可安全置於已編碼 query
  if (!shape || shape.length > 3000 || !/^[\x3F-\x7E]+$/.test(shape)) return { error: "shape 無效或過長" };
  // 寫入端也做點數上限（與讀端同規則解碼计数；解碼器兩腳本各自內嵌、由漂移測試守同步）
  if (wlocRouteCountPoints(shape) === null) return { error: "shape 解碼失敗或點數超出 2–800" };
  var speed = parseFloat(params.get("speed"));
  if (!Number.isFinite(speed) || speed <= 0 || speed > 80) return { error: "speed 必須在 0–80 m/s" };
  var mult = parseFloat(params.get("mult"));
  if (!Number.isFinite(mult) || mult <= 0 || mult > 10) return { error: "mult 必須在 0–10" };
  var t0 = parseInt(params.get("t0"), 10);
  if (!Number.isFinite(t0) || t0 < 946684800000 || t0 > Date.now() + 31536000000) return { error: "t0 時間戳不合理" };
  var mode = String(params.get("mode") || "walking").slice(0, 16);
  var provider = String(params.get("provider") || "valhalla").slice(0, 16);
  return { ok: true, route: { v: 1, mode: mode, provider: provider, shape: shape, speed: speed, mult: mult, t0: t0, pausedMs: 0, pauseStart: null } };
}

function wlocRouteHandle(action, params, store, log) {
  try {
    if (action === "route-set") {
      var check = wlocRouteValidate(params);
      if (!check.ok) return { success: false, error: check.error };
      if (!store.setItem(WLOC_ROUTE_KEY, check.route)) { log("[wloc-settings] 路線寫入 setItem 回傳 false"); return { success: false, error: "寫入失敗" }; }
      log("[wloc-settings] 路線模擬已寫入 wloc_route");
      return { success: true, action: "route-set", v: 1, mode: check.route.mode, speed: check.route.speed, mult: check.route.mult, t0: check.route.t0 };
    }
    if (action === "route-pause") {
      var cur = store.getItem(WLOC_ROUTE_KEY);
      if (!cur || cur.v !== 1) return { success: false, error: "沒有進行中的路線模擬" };
      if (cur.pauseStart) return { success: true, action: "route-pause", paused: true }; // 冪等
      cur.pauseStart = Date.now();
      if (!store.setItem(WLOC_ROUTE_KEY, cur)) return { success: false, error: "寫入失敗" };
      return { success: true, action: "route-pause", paused: true };
    }
    if (action === "route-resume") {
      var cur2 = store.getItem(WLOC_ROUTE_KEY);
      if (!cur2 || cur2.v !== 1) return { success: false, error: "沒有進行中的路線模擬" };
      if (cur2.pauseStart) { cur2.pausedMs = (Number(cur2.pausedMs) || 0) + Math.max(0, Date.now() - cur2.pauseStart); cur2.pauseStart = null; }
      if (!store.setItem(WLOC_ROUTE_KEY, cur2)) return { success: false, error: "寫入失敗" };
      return { success: true, action: "route-resume", paused: false, pausedMs: cur2.pausedMs };
    }
    if (action === "route-clear") {
      store.setItem(WLOC_ROUTE_KEY, null);
      log("[wloc-settings] 已清除 wloc_route（wloc_settings 不受影響）");
      return { success: true, action: "route-clear" };
    }
    if (action === "route-status") {
      var st = store.getItem(WLOC_ROUTE_KEY);
      if (!st || st.v !== 1) return { success: true, active: false };
      return { success: true, active: true, mode: st.mode, speed: st.speed, mult: st.mult, t0: st.t0, pausedMs: st.pausedMs || 0, paused: !!st.pauseStart, shape: st.shape };
    }
    return null; // 非 route action → 交回原邏輯
  } catch (e) {
    return { success: false, error: e.message || "路線操作失敗" };
  }
}
