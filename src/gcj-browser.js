// 瀏覽器端 GCJ-02 換算, 以字串形式注入選點頁面。
//
// 為什麼是字串而不是正常的 export: page.js 整體是一個模板串, 頁面裡的 JS 跑在
// 瀏覽器, 而 parse.js 的實現跑在 Worker 裡 —— 地圖點擊事件拿不到伺服器端函式。
// 用字串注入而不是 fn.toString(), 是因為部署走 `wrangler deploy --minify`,
// 壓縮會重命名識別符, toString() 出來的程式碼引用的是壓縮後的名字, 注入到頁面的
// 新作用域裡會全部對不上。字串字面量的內容 esbuild 不會碰。
//
// 這是 parse.js 中同名函式的鏡像。test/parse.test.mjs 會在多個採樣點上逐一比對
// 兩份實現的輸出, 任何一邊改了另一邊沒跟上, 測試立刻變紅。
export const GCJ_BROWSER_JS = `
var GCJ_A = 6378245.0, GCJ_EE = 0.00669342162296594323;
function gcjOutOfChina(lng, la) {
  return lng < 72.004 || lng > 137.8347 || la < 0.8293 || la > 55.8271;
}
function gcjDeltaLat(x, y) {
  var r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  r += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return r;
}
function gcjDeltaLon(x, y) {
  var r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  r += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return r;
}
function wgs84ToGcj02(lat, lon) {
  if (gcjOutOfChina(lon, lat)) return { lat: lat, lon: lon };
  var dLat = gcjDeltaLat(lon - 105.0, lat - 35.0);
  var dLon = gcjDeltaLon(lon - 105.0, lat - 35.0);
  var radLat = (lat / 180.0) * Math.PI;
  var magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLon = (dLon * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lon: lon + dLon };
}
function gcj02ToWgs84(lat, lon) {
  if (gcjOutOfChina(lon, lat)) return { lat: lat, lon: lon };
  var wgsLat = lat, wgsLon = lon;
  for (var i = 0; i < 6; i++) {
    var g = wgs84ToGcj02(wgsLat, wgsLon);
    var errLat = g.lat - lat, errLon = g.lon - lon;
    if (Math.abs(errLat) < 1e-9 && Math.abs(errLon) < 1e-9) break;
    wgsLat -= errLat;
    wgsLon -= errLon;
  }
  return { lat: wgsLat, lon: wgsLon };
}
`;
