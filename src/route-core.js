// 路線規劃核心：provider 對映、polyline 解碼、累計距離與沿路插值。
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
// docs/routing-map-research.md 層級 2 分析）。
//
// 座標系：一律 WGS84。Valhalla/Mapbox/MapTiler 的路網輸出皆為 WGS84；
// GCJ 圖層上的顯示轉換由 page.js 的 toDisplay 集中處理。

export const ROUTE_CORE_JS = `
/* ---- 統一模式定義：三種交通方式在每個 provider 都有真實對應的 route profile ---- */
var ROUTE_MODES = {
  walking: { valhalla: 'pedestrian', mapbox: 'walking', maptiler: 'walking', baseSpeed: 1.4 },
  biking:  { valhalla: 'bicycle',    mapbox: 'cycling',  maptiler: 'cycling',  baseSpeed: 5.0 },
  driving: { valhalla: 'auto',       mapbox: 'driving',  maptiler: 'driving',  baseSpeed: 13.0 }
};

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

/* ---- provider 請求构造（統一介面 fetchRoute -> {coords, distance_m, duration_s}） ---- */
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
function maptilerDirectionsUrl(profile, from, to, key) {
  return 'https://api.maptiler.com/directions/' + profile + '/' +
    from.lon + ',' + from.lat + ';' + to.lon + ',' + to.lat +
    '.json?key=' + encodeURIComponent(key);
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
function parseRouteResponse(provider, data) {
  if (provider === 'valhalla') {
    var trip = data && data.trip;
    if (!trip) throw new Error('BAD_RESP');
    var coords = [];
    if (trip.shape) coords = decodePolyline(trip.shape, 1e6);
    else (trip.legs || []).forEach(function (l) { if (l.shape) coords = coords.concat(decodePolyline(l.shape, 1e6)); });
    if (!coords.length) throw new Error('NO_ROUTE');
    var sum = trip.summary || {};
    return { coords: coords, distance_m: (Number(sum.length) || 0) * 1000, duration_s: Number(sum.time) || 0 };
  }
  var route = data && data.routes && data.routes[0];
  if (!route) throw new Error((data && (data.code === 'NoRoute' || data.code === 'NoValidRoutes')) ? 'NO_ROUTE' : 'BAD_RESP');
  var cs = normLatLngPairs(route.geometry && route.geometry.coordinates);
  if (!cs.length) throw new Error('BAD_RESP');
  return { coords: cs, distance_m: Number(route.distance) || 0, duration_s: Number(route.duration) || 0 };
}
function fetchRoute(opts) {
  var provider = opts.provider || 'valhalla';
  var mode = opts.mode || 'walking';
  var m = ROUTE_MODES[mode];
  if (!m) return Promise.reject(new Error('BAD_RESP'));
  if (provider === 'valhalla') {
    return fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valhallaRouteBody(mode, opts.from, opts.to))
    }).then(function (r) {
      if (!r.ok) throw new Error('NET');
      return r.json();
    }).then(function (d) {
      return parseRouteResponse('valhalla', d);
    });
  }
  var key = (opts.key || '').trim();
  if (!key) return Promise.reject(new Error('NEED_KEY'));
  var url = provider === 'mapbox'
    ? mapboxDirectionsUrl(m.mapbox, opts.from, opts.to, key)
    : maptilerDirectionsUrl(m.maptiler, opts.from, opts.to, key);
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('NET');
    return r.json();
  }).then(function (d) {
    return parseRouteResponse(provider, d);
  });
}
`;
