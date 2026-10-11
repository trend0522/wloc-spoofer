// 路線規劃核心：provider 對映、polyline 解碼、座標解析、累計距離與沿路插值。
//
// 與 gcj-browser.js 相同的「字串注入」模式：選點頁 (page.js) 是單一模板字串，
// 瀏覽器端的實作必須以字面字串注入，不能用 fn.toString()——部署走
// `wrangler deploy --minify`，壓縮會重命名識別符，toString() 產出的程式碼在
// 新作用域裡全部對不上。字串內容 esbuild 不會碰。
//
// 同一份字串也供 test/route-core.test.mjs 在 vm 裡直接執行——瀏覽器與測試
// 共用同一實作，沒有鏡像漂移問題（吸取 parse.js / gcj-browser.js 雙份教訓）。
//
// 層級 1 宣稱：這裡只做「網頁路線預覽」（取路線、算進度、供頁面動畫），
// 不涉及 iOS 系統定位模擬（那需要 dist/wloc.js 層的配合，見
// docs/route-simulation-level2-plan.md 層級 2 分析）。
//
// 座標系：一律 WGS84。Valhalla/Mapbox 的路網輸出皆為 WGS84；
// GCJ 圖層上的顯示轉換由 page.js 的 toDisplay 集中處理。
//
// Provider 取捨（2026-10-11 實測證據，不是猜的）：
// - valhalla1.openstreetmap.de（主用，免 Key）：22/22 連發全 200；CORS
//   access-control-allow-origin:* 在 200 與 400 上都齊；preflight 204 通過。
//   真實 per-mode costing（pedestrian/bicycle/auto）。上限是服務契約的一部分：
//   步行 100km、腳踏車 150km（error_code 154）、無陸路連通回 error_code 442——
//   這些都是 400，舊版一律標成「連線失敗」是本次修的錯。
// - Mapbox Directions（唯一備援，需使用者自備 public token）：端點實存
//   （無效 token 回 401 NotAuthorized 而非 404），官方 profiles 為
//   driving / driving-traffic / walking / cycling，三模式都有真實對應。
// - router.project-osrm.org：已排除。foot/bike/driving 三個 profile 回傳
//   完全相同的 distance 與 weight（6082.2m/474 與 348751.2m 兩組路線皆然）——
//   它只有車用路網，「換標籤」不算支援步行/腳踏車。
// - MapTiler Directions：已排除。所探測的全部候選路徑回 404，無鑰情況下
//   無法驗證端點與 profile；依「先確認供應商、端點、授權、profile 才加入」
//   原則不啟用。（MapTiler 仍可用於功能A 的圖磚，只是不給路線。）

export const ROUTE_CORE_JS = `
/* ---- 統一模式定義：三種交通方式在每個 provider 都有真實對應的 route profile ---- */
var ROUTE_MODES = {
  walking: { valhalla: 'pedestrian', mapbox: 'walking', baseSpeed: 1.4 },
  biking:  { valhalla: 'bicycle',    mapbox: 'cycling',  baseSpeed: 5.0 },
  driving: { valhalla: 'auto',       mapbox: 'driving',  baseSpeed: 13.0 }
};

/* ---- 起終點文字解析：「lat, lon」「lat lon」「lat;lon」皆可（貼上友好），帶範圍驗證 ---- */
function parseLatLngText(s) {
  var parts = String(s == null ? '' : s).trim().split(/[,;\\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  var la = Number(parts[0]), lo = Number(parts[1]);
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lon: lo };
}

/* ---- polyline 編碼（層級2 裝置寫入用；與 decodePolyline 互為逆） ---- */
function polylineEncode(pairs, factor) {
  var lastLat = 0, lastLon = 0, out = '';
  function step(v) {
    var n = v < 0 ? ~(v << 1) : (v << 1);
    while (n >= 0x20) { out += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    out += String.fromCharCode(n + 63);
  }
  for (var i = 0; i < pairs.length; i++) {
    var la = Math.round(pairs[i][0] * factor), lo = Math.round(pairs[i][1] * factor);
    step(la - lastLat); lastLat = la;
    step(lo - lastLon); lastLon = lo;
  }
  return out;
}

/* ---- polyline 解碼（Google 編碼；Valhalla 預設 1e6、舊服務 1e5） ---- */
function decodePolyline(str, factor) {
  var pts = [], index = 0, lat = 0, lon = 0, len = str.length;
  while (index < len) {
    var b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    pts.push({ lat: lat / factor, lon: lon / factor });
  }
  return pts;
}

/* ---- 距離/進度幾何（haversine + 累積距離表 + 線性插值） ---- */
function havMeters(a, b) {
  var R = 6371000, p = Math.PI / 180;
  var dLat = (b.lat - a.lat) * p, dLon = (b.lon - a.lon) * p;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}
function routeCumulative(coords) {
  var cum = [0];
  for (var i = 1; i < coords.length; i++) cum.push(cum[i - 1] + havMeters(coords[i - 1], coords[i]));
  return cum;
}
function routePositionAt(coords, cum, dist) {
  if (!coords || !coords.length) return null;
  if (dist <= 0) return coords[0];
  var total = cum[cum.length - 1];
  if (dist >= total) return coords[coords.length - 1];
  var i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  var seg = cum[i] - cum[i - 1];
  var f = seg > 0 ? (dist - cum[i - 1]) / seg : 0;
  return { lat: coords[i - 1].lat + (coords[i].lat - coords[i - 1].lat) * f,
           lon: coords[i - 1].lon + (coords[i].lon - coords[i - 1].lon) * f };
}

/* ---- provider 請求构造
   fetchRoute(opts) -> {coords, distance_m, duration_s}
   失敗時 Error.message 是分類碼，UI 依碼顯示不同訊息與重試：
   NEED_KEY(未填鑰) BAD_KEY(鑰被拒) NO_ROUTE(無可行路線) TOO_FAR(超出該模式單次距離上限)
   SERVICE(限流/5xx/壞回應) NET(連不到) BAD_REQ(請求被拒) ---- */
var VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';
function valhallaRouteBody(mode, from, to) {
  return {
    costing: ROUTE_MODES[mode].valhalla,
    locations: [ { lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon } ],
    shape_attributes: [ 'shape' ]
  };
}
function mapboxDirectionsUrl(profile, from, to, key) {
  return 'https://api.mapbox.com/directions/v5/mapbox/' + profile + '/' +
    from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat +
    '?geometries=geojson&access_token=' + encodeURIComponent(key);
}
function normLatLngPairs(arr) {
  var out = [];
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length; i++) {
    var p = arr[i];
    if (p && typeof p === 'object' && !Array.isArray(p) && 'lat' in p && 'lon' in p) {
      out.push({ lat: Number(p.lat), lon: Number(p.lon) });
    } else if (Array.isArray(p) && p.length >= 2) {
      // GeoJSON 慣例：[lon, lat]
      out.push({ lat: Number(p[1]), lon: Number(p[0]) });
    }
  }
  return out;
}
function classifyHttpStatus(status) {
  if (status === 401 || status === 403) return 'BAD_KEY';
  if (status === 429 || status >= 500) return 'SERVICE';
  return 'BAD_REQ';
}
// Valhalla 的 400 有兩種使用者意義：154=超過該模式單次距離上限、442=找不到陸路
function classifyValhallaError(status, data) {
  if (data && data.error_code === 154) return 'TOO_FAR';
  if (data && data.error_code === 442) return 'NO_ROUTE';
  return classifyHttpStatus(status);
}
function parseValhallaSuccess(trip) {
  var coords = [];
  if (trip.shape) coords = decodePolyline(trip.shape, 1e6);
  else (trip.legs || []).forEach(function (l) { if (l.shape) coords = coords.concat(decodePolyline(l.shape, 1e6)); });
  if (!coords.length) throw new Error('SERVICE');
  var sum = trip.summary || {};
  return { coords: coords, distance_m: (Number(sum.length) || 0) * 1000, duration_s: Number(sum.time) || 0 };
}
function parseMapboxSuccess(data) {
  var route = data && data.routes && data.routes[0];
  var cs = normLatLngPairs(route.geometry && route.geometry.coordinates);
  if (!cs.length) throw new Error('SERVICE');
  return { coords: cs, distance_m: Number(route.distance) || 0, duration_s: Number(route.duration) || 0 };
}
function timeoutSignal(ms) {
  return (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
}
function fetchOnce(opts) {
  var provider = opts.provider || 'valhalla';
  var mode = opts.mode || 'walking';
  var m = ROUTE_MODES[mode];
  if (!m) return Promise.reject(new Error('BAD_REQ'));
  var sig = timeoutSignal(opts.timeoutMs || 20000);
  if (provider === 'valhalla') {
    return fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valhallaRouteBody(mode, opts.from, opts.to)),
      signal: sig
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (r.ok && d && d.trip) return parseValhallaSuccess(d.trip);
        throw new Error(d ? classifyValhallaError(r.status, d) : (r.ok ? 'SERVICE' : classifyHttpStatus(r.status)));
      });
    });
  }
  var key = (opts.key || '').trim();
  if (!key) return Promise.reject(new Error('NEED_KEY'));
  return fetch(mapboxDirectionsUrl(m.mapbox, opts.from, opts.to, key), { signal: sig }).then(function (r) {
    return r.json().catch(function () { return null; }).then(function (d) {
      if (r.ok && d && d.code === 'Ok' && d.routes && d.routes.length) return parseMapboxSuccess(d);
      if (r.status === 401 || r.status === 403) throw new Error('BAD_KEY');
      if (d && (d.code === 'NoRoute' || d.code === 'NoValidRoutes')) throw new Error('NO_ROUTE');
      throw new Error(r.ok ? 'SERVICE' : classifyHttpStatus(r.status));
    });
  });
}
// 先歸檔（TypeError=連不到/含CORS被擋；TimeoutError=超時），再決定重試。
// 逾時/NET/SERVICE 才快速重試一次；4xx（無路線、超限、壞鑰）是確定性結果，不重打公共服務
function fetchRoute(opts) {
  return fetchOnce(opts).catch(function (err) {
    var m = String((err && err.message) || '');
    var code = /^(NET|SERVICE|NO_ROUTE|TOO_FAR|BAD_KEY|NEED_KEY|BAD_REQ)$/.test(m) ? m : 'NET';
    err = (code === m) ? err : new Error(code);
    if (code !== 'NET' && code !== 'SERVICE') throw err;
    return new Promise(function (res) { setTimeout(res, 900); }).then(function () {
      return fetchOnce(opts).catch(function (e2) {
        var m2 = String((e2 && e2.message) || '');
        throw (/^(NET|SERVICE|NO_ROUTE|TOO_FAR|BAD_KEY|NEED_KEY|BAD_REQ)$/.test(m2)) ? e2 : new Error('NET');
      });
    });
  });
}
`;
