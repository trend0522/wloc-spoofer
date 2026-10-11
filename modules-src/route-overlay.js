// 層級 2 路線模拟 overlay（讀端）——錨點注入 dist/wloc.js。
// 未壓縮、可審閱；由 scripts/build-dist.mjs 注入。錨點失配 = 構建失敗（不靜默跳過）。
//
// 行為契約（docs/route-simulation-level2-plan.md §3.3）：
// - 無效/缺失 wloc_route → 完全保留現行單點行為（wloc.js 本身零改動）。
// - 有效 wloc_route → 以「事件式時間插值」取代單點：pos = interpolate(shape,
//   (now − t0 − pausedMs − (pauseStart? now − pauseStart : 0)) / 1000 × speed × mult)。
//   位置只在 Apple 實際發出 /clls/wloc 時推進（無排程器；節律=可見粒度上限）。
// - 抵達終點後停在終點，直到使用者明確 route-clear（本實作採策略 b：stay）。
// - 任何例外 → 記錄後回落單點；fail-closed。
// - jitter（randomRadius）維持現行語意，疊在推算點上。

var WLOC_ROUTE_KEY = "wloc_route";
var WLOC_ROUTE_MAX_POINTS = 800;
var WLOC_ROUTE_MAX_JSON = 4096;

function wlocRouteDecodePolyline(str) {
  var pts = [], index = 0, lat = 0, lon = 0, len = str.length;
  while (index < len) {
    var b, shift = 0, result = 0;
    do {
      if (index >= len) return []; // 截斷的 varint → 整條作廢（呼叫端落回單點）
      b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do {
      if (index >= len) return [];
      b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5;
    } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    pts.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return pts;
}

function wlocRouteHavMeters(a, b) {
  var R = 6371000, p = Math.PI / 180;
  var dLat = (b.lat - a.lat) * p, dLon = (b.lon - a.lon) * p;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

// 回傳推進後的 {longitude, latitude}；任何不合格回 null（呼叫端落回單點）。
// 信任邊界在讀端：所有欄位一律重驗，不信任寫入端與網頁。
function wlocRoutePosition(raw, nowMs) {
  try {
    if (!raw || typeof raw !== "object") return null;
    if (raw.v !== 1) return null; // 未知版本 → 忽略（前向相容）
    if (typeof raw.shape !== "string" || raw.shape.length === 0 || raw.shape.length > 3000) return null;
    // Google polyline 字元集=ASCII 0x3F–0x7E（含 ? @ [ ] ^ _ ` { | } ~），白名單擋注入
    if (!/^[\x3F-\x7E]+$/.test(raw.shape)) return null;
    var speed = Number(raw.speed), mult = Number(raw.mult), t0 = Number(raw.t0);
    if (!isFinite(speed) || speed <= 0 || speed > 80) return null;
    if (!isFinite(mult) || mult <= 0 || mult > 10) return null;
    if (!isFinite(t0) || t0 < 0) return null;
    var pts = wlocRouteDecodePolyline(raw.shape);
    if (pts.length < 2 || pts.length > WLOC_ROUTE_MAX_POINTS) return null;
    for (var i = 0; i < pts.length; i++) {
      if (!isFinite(pts[i].lat) || !isFinite(pts[i].lon) || Math.abs(pts[i].lat) > 90 || Math.abs(pts[i].lon) > 180) return null;
    }
    var cum = [0];
    for (var j = 1; j < pts.length; j++) cum.push(cum[j - 1] + wlocRouteHavMeters(pts[j - 1], pts[j]));
    var total = cum[cum.length - 1];
    if (!(total > 0) || total > 20000000) return null;
    var pausedMs = Math.max(0, Number(raw.pausedMs) || 0);
    var pauseStart = Number(raw.pauseStart);
    var elapsedMs = nowMs - t0 - pausedMs - (isFinite(pauseStart) && pauseStart > t0 ? Math.max(0, nowMs - pauseStart) : 0);
    if (elapsedMs < 0) elapsedMs = 0;
    var dist = (elapsedMs / 1000) * speed * mult;
    if (dist > total) dist = total; // 抵達後停留終點（stay 策略）
    var k = 1;
    while (k < cum.length && cum[k] < dist) k++;
    var seg = cum[k] - cum[k - 1];
    var f = seg > 0 ? (dist - cum[k - 1]) / seg : 0;
    var lat2 = pts[k - 1].lat + (pts[k].lat - pts[k - 1].lat) * f;
    var lon2 = pts[k - 1].lon + (pts[k].lon - pts[k - 1].lon) * f;
    var arrived = dist >= total;
    return { longitude: lon2, latitude: lat2, distM: Math.round(dist), totalM: Math.round(total), arrived: arrived, paused: isFinite(pauseStart) && pauseStart > t0 };
  } catch (e) {
    return null;
  }
}
