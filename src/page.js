import { GCJ_BROWSER_JS } from "./gcj-browser.js";

export function getPageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>WLOC 虛擬定位</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="WLOC">
<!-- 内联图标: 没有它浏览器每次加载都会去要 /favicon.ico 并拿到 404 -->
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%93%8D%3C/text%3E%3C/svg%3E">
<!-- integrity 为 Leaflet 官方在 leafletjs.com/download.html 公布的 SRI 值,
     可自行核对。CDN 被篡改时浏览器会拒绝执行, 下面的 typeof L 检查会给出提示。 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous"/>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"><\/script>
<style>
:root { --blue:#007aff; --green:#34c759; --red:#ff3b30; --gray:#636366; --bg:#f2f2f7; --orange:#ff9500; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,system-ui,"SF Pro","Helvetica Neue",sans-serif; background:var(--bg); overscroll-behavior-y:none; }
#map { height:50vh; width:100%; min-height:250px; }
.panel { padding:16px; max-width:600px; margin:0 auto; }
.card { background:#fff; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
.card h3 { font-size:15px; font-weight:600; margin-bottom:10px; }
.coords { font-family:"SF Mono",monospace; font-size:14px; color:#333; padding:8px 12px; background:var(--bg); border-radius:8px; word-break:break-all; }
.row { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
.btn { flex:1; min-width:100px; padding:12px 16px; border:none; border-radius:10px; font-size:14px; font-weight:500; cursor:pointer; transition:all .15s; }
.btn-primary { background:var(--blue); color:#fff; }
.btn-primary:active { background:#005bb5; transform:scale(.97); }
.btn-secondary { background:#e5e5ea; color:#333; }
.btn-secondary:active { background:#d1d1d6; transform:scale(.97); }
.btn-danger { background:var(--red); color:#fff; }
.btn-danger:active { background:#d63027; transform:scale(.97); }
.btn.success { background:var(--green); color:#fff; }
.btn:disabled { opacity:.6; }
.btn-sm { flex:none; min-width:auto; padding:6px 12px; min-height:40px; font-size:12px; border-radius:8px; }
.input-row { display:flex; gap:8px; margin-top:10px; }
.input-row input { flex:1; padding:10px 12px; border:1px solid #d1d1d6; border-radius:8px; font-size:14px; outline:none; min-width:0; }
.input-row input:focus { border-color:var(--blue); }
.status { font-size:12px; color:var(--gray); margin-top:8px; text-align:center; }
.error-banner { background:#d70015; color:#fff; padding:14px 16px; border-radius:12px; margin-bottom:12px; font-size:14px; line-height:1.5; display:none; }
.error-banner b { display:block; margin-bottom:4px; }
.toast { position:fixed; top:60px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; max-width:90vw; text-align:center; }
.toast.show { opacity:1; }
.active-loc { background:var(--bg); border-radius:8px; padding:10px 12px; font-size:13px; color:#333; }
.active-loc .label { font-size:11px; color:var(--gray); margin-bottom:4px; }
.active-loc .value { font-family:"SF Mono",monospace; font-size:13px; }
.fav-list { max-height:240px; overflow-y:auto; }
.fav-item { display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--bg); border-radius:8px; margin-bottom:6px; cursor:pointer; transition:background .15s; }
.fav-item:active { background:#e0e0e5; }
.fav-item .fav-info { flex:1; min-width:0; }
.fav-item .fav-name { font-size:14px; font-weight:500; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fav-item .fav-coords { font-size:11px; color:var(--gray); font-family:"SF Mono",monospace; margin-top:2px; }
.fav-item .fav-active { font-size:10px; color:#248a3d; font-weight:600; }
.fav-item .fav-del { flex:none; width:28px; height:28px; position:relative; border:none; border-radius:50%; background:transparent; color:var(--red); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s; }
.fav-item .fav-del::before { content:""; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:44px; height:44px; }
.fav-item .fav-del:hover { background:rgba(255,59,48,.1); }
.fav-empty { text-align:center; color:var(--gray); font-size:13px; padding:16px 0; }
.fav-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.fav-header h3 { margin-bottom:0; }
.modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.4); z-index:10000; display:none; align-items:center; justify-content:center; padding:20px; }
.modal-overlay.show { display:flex; }
.modal { background:#fff; border-radius:16px; padding:20px; width:100%; max-width:340px; }
.modal h3 { font-size:17px; font-weight:600; margin-bottom:16px; text-align:center; }
.modal input { width:100%; padding:12px; border:1px solid #d1d1d6; border-radius:10px; font-size:15px; outline:none; margin-bottom:12px; }
.modal input:focus { border-color:var(--blue); }
.modal .modal-btns { display:flex; gap:8px; }
.modal .modal-btns .btn { padding:12px; }
.layer-switch { position:absolute; top:10px; right:10px; z-index:1000; display:flex; flex-wrap:wrap; gap:4px; max-width:calc(100vw - 110px); background:rgba(255,255,255,.92); border-radius:8px; padding:4px; box-shadow:0 2px 8px rgba(0,0,0,.15); }
.layer-btn { border:none; background:transparent; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:500; color:#333; cursor:pointer; transition:all .15s; white-space:nowrap; }
.layer-btn.active { background:var(--blue); color:#fff; }
.layer-btn:active { transform:scale(.95); }
.lang-switch { position:absolute; top:10px; left:10px; z-index:1000; display:flex; gap:2px; background:rgba(255,255,255,.92); border-radius:8px; padding:4px; box-shadow:0 2px 8px rgba(0,0,0,.15); }
.lang-btn { border:none; background:transparent; padding:6px 11px; border-radius:6px; font-size:12px; font-weight:600; color:#333; cursor:pointer; transition:all .15s; }
.lang-btn.active { background:var(--blue); color:#fff; }
.lang-btn:active { transform:scale(.95); }
@media(max-width:480px) { #map { height:44vh; } .panel { padding:12px; } .layer-btn { padding:5px 7px; font-size:11px; } }
</style>
</head>
<body>
<div style="position:relative">
<div id="map"></div>
<div class="lang-switch">
  <button class="lang-btn" data-lang="zh" onclick="setLang('zh')">繁</button>
  <button class="lang-btn" data-lang="en" onclick="setLang('en')">EN</button>
</div>
<div class="layer-switch">
  <button class="layer-btn active" data-layer="satellite" data-i18n="layer_satellite" onclick="switchLayer('satellite')">Satellite</button>
  <button class="layer-btn" data-layer="wgs84" data-i18n="layer_wgs84" onclick="switchLayer('wgs84')">WGS84</button>
  <button class="layer-btn" data-layer="amap" data-i18n="layer_amap" data-i18n-title="amap_title" onclick="switchLayer('amap')">Amap</button>
  <button class="layer-btn" data-layer="voyager" data-i18n="layer_color" onclick="switchLayer('voyager')">Color</button>
  <button class="layer-btn" data-layer="standard" data-i18n="layer_standard" onclick="switchLayer('standard')">Standard</button>
  <button class="layer-btn" data-layer="dark" data-i18n="layer_dark" onclick="switchLayer('dark')">Dark</button>
</div>
</div>
<div class="panel">
  <div class="error-banner" id="errorBanner" data-i18n-html="err_html"></div>
  <div class="card">
    <h3 data-i18n="choose_title">Choose target location</h3>
    <div class="coords" id="coords">Tap the map or use the tools below to pick a location</div>
    <div class="input-row" style="margin-top:10px">
      <label style="font-size:13px;color:var(--gray);display:flex;align-items:center;gap:6px;white-space:nowrap"><span data-i18n="radius_label">Jitter radius (m)</span>
        <input id="radiusInput" type="number" min="0" max="5000" step="1" value="0" style="width:80px;flex:none" aria-label="Jitter radius in meters" />
      </label>
      <span style="font-size:11px;color:var(--gray);line-height:1.3" data-i18n="radius_hint">Each fix drifts randomly around the target point; 0 = off</span>
    </div>
    <div class="row">
      <button class="btn btn-primary" id="saveBtn" data-i18n="save" onclick="save()">Save to Device</button>
      <button class="btn btn-secondary" data-i18n="add_fav" onclick="addFav()">Add Favorite</button>
      <button class="btn btn-secondary" data-i18n="locate" onclick="locateMe()">Current Location</button>
    </div>
  </div>
  <div class="card">
    <div class="fav-header">
      <h3 data-i18n="fav_title">Favorites</h3>
      <button class="btn btn-sm btn-secondary" data-i18n="clear_all" onclick="clearAllFav()" id="clearAllBtn" style="display:none">Clear All</button>
    </div>
    <div id="favList" class="fav-list"></div>
  </div>
  <div class="card">
    <h3 data-i18n="active_title">Active coordinates</h3>
    <div class="active-loc" id="activeLoc">
      <div class="label" data-i18n="active_label">Device persisted data (wloc_settings)</div>
      <div class="value" id="activeValue">Querying...</div>
    </div>
    <div class="row">
      <button class="btn btn-sm btn-secondary" data-i18n="refresh" onclick="queryActive()">Refresh</button>
      <button class="btn btn-sm btn-danger" data-i18n="clear_data" onclick="clearActive()">Clear Data</button>
    </div>
  </div>
  <div class="card">
    <h3 data-i18n="paste_title">Paste map link</h3>
    <div class="input-row">
      <input id="urlInput" data-i18n-ph="paste_ph" placeholder="Apple/Google/Amap/Baidu map link or coordinates" aria-label="Map link or coordinates" />
      <button class="btn btn-secondary" style="flex:none;min-width:56px" data-i18n="parse" onclick="parseUrl()">Parse</button>
    </div>
    <div style="font-size:11px;color:var(--gray);margin-top:6px" data-i18n="paste_hint">Supports Apple Maps · Google Maps · Amap · Baidu · coordinate text</div>
  </div>
  <div class="card">
    <h3 data-i18n="search_title">Search place</h3>
    <div class="input-row">
      <input id="searchInput" data-i18n-ph="search_ph" placeholder="Enter a place name (e.g. The Bund, Shanghai)" aria-label="Place name search" />
      <button class="btn btn-secondary" style="flex:none;min-width:56px" data-i18n="search" onclick="searchPlace()">Search</button>
    </div>
  </div>
  <div class="status" id="status" aria-live="polite">Pick a location, then tap "Save to Device" to write it to your proxy tool</div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="modal-overlay" id="favModal">
  <div class="modal">
    <h3 data-i18n="modal_title">Add this location to favorites</h3>
    <input id="favNameInput" data-i18n-ph="modal_ph" placeholder="Enter a label (e.g. Office, Home)" maxlength="30" aria-label="Favorite label" />
    <div style="font-size:12px;color:var(--gray);margin-bottom:12px;text-align:center" id="favModalCoords"></div>
    <div class="modal-btns">
      <button class="btn btn-secondary" data-i18n="cancel" onclick="closeFavModal()">Cancel</button>
      <button class="btn btn-primary" data-i18n="save_short" onclick="confirmFav()">Save</button>
    </div>
  </div>
</div>
<script>
if (typeof L === 'undefined') {
  document.getElementById('map').innerHTML =
    '<div style="padding:24px;text-align:center;font-size:14px;color:#8e8e93;line-height:1.6">' +
    '地圖庫載入失敗<br>jsdelivr CDN 不可達，請檢查網路或代理後重新整理<\\/div>';
  throw new Error('leaflet unavailable');
}
${GCJ_BROWSER_JS}
const SAVE_API = 'https://gs-loc.apple.com/wloc-settings/save';
const FAV_KEY = 'wloc_favorites';
const LANG_KEY = 'wloc_lang';
// lat/lon 恒为 WGS84 —— 这是写进设备、也是 wloc 唯一认的坐标系。
// 底图可能是 GCJ-02 图源, 屏幕上的经纬度与它并不相等, 换算集中在 toDisplay/
// fromDisplay 两个函数里, 其它地方一律不碰。
let lat = 22.544577, lon = 113.94114;
let selected = false;
let activeLon = null, activeLat = null, activeAcc = null, activeStatus = 'querying';
let savedLon = null, savedLat = null, savedTimeStr = '';
let saveTimer = null;
let layerIsGcj = false;

// 高德瓦片画的是 GCJ-02 地物, 而 Leaflet 按 WGS84 算「像素 -> 经纬度」。所以在
// 高德图层上点中的那个读数, 其实是目标点的 GCJ-02 值; 不反算就直接存, 深圳一带
// 会偏 500 米左右 —— 对一个定位工具来说这是致命的。反过来, 要把一个 WGS84 点
// 画在高德图层上, 得先正算成 GCJ-02, 否则 marker 会落在错误的楼上。
function toDisplay(la, lo) { return layerIsGcj ? wgs84ToGcj02(la, lo) : { lat: la, lon: lo }; }
function fromDisplay(la, lo) { return layerIsGcj ? gcj02ToWgs84(la, lo) : { lat: la, lon: lo }; }

/* ---- i18n (zh-Hant default / en) ---- */
const I18N = {
  zh: {
    title: 'WLOC 虛擬定位',
    layer_satellite: '衛星', layer_wgs84: 'WGS84', layer_amap: '高德', layer_color: '彩色', layer_standard: '標準', layer_dark: '暗色',
    amap_title: '高德為 GCJ-02 偏移圖資，選點已自動換算回 WGS84',
    err_html: '<b>模組未生效</b>請檢查以下設定：<br>1. 已安裝並啟用 WLOC 定位模組<br>2. MITM 已開啟且信任憑證<br>3. MITM 主機名稱包含 gs-loc.apple.com<br>4. 目前網路已走代理',
    choose_title: '選擇目標位置',
    coords_hint: '點擊地圖或使用下方工具選擇位置',
    radius_label: '擾動半徑(公尺)',
    radius_hint: '每次定位會在目標點周圍隨機偏移，0＝關閉',
    save: '儲存到裝置', add_fav: '收藏位置', locate: '目前位置',
    fav_title: '收藏的位置', clear_all: '清除全部',
    active_title: '目前生效座標', active_label: '裝置持久化資料 (wloc_settings)',
    refresh: '重新整理', clear_data: '清除資料',
    paste_title: '貼上地圖連結', paste_ph: 'Apple/Google/高德/百度地圖連結 或 經緯度', parse: '解析',
    paste_hint: '支援 Apple Maps · Google Maps · 高德 · 百度 · 座標文字',
    search_title: '搜尋地點', search_ph: '輸入地名（例如：上海外灘）', search: '搜尋',
    status_hint: '選好位置後點擊「儲存到裝置」寫入代理工具',
    modal_title: '收藏此位置', modal_ph: '輸入備註名稱（例如：公司、家）', cancel: '取消', save_short: '儲存',
    lon: '經度', lat: '緯度', acc: '精度',
    querying: '查詢中...', no_saved: '無已儲存的座標', query_failed: '查詢失敗（需要代理模組支援）', cleared: '已清除',
    fav_empty: '暫無收藏，選好位置後點擊「收藏位置」',
    active_now: '✓ 目前生效', del: '刪除',
    pick_first: '請先在地圖上選擇一個位置',
    enter_label: '請輸入備註名稱',
    added: function(n){ return '已收藏：' + n; },
    deleted: function(n){ return '已刪除：' + n; },
    clear_fav_confirm: '確定清除所有收藏？', all_cleared: '已清除所有收藏',
    clear_confirm: '確定清除裝置上已儲存的座標？清除後將使用模組預設參數或停止修改定位。',
    dev_cleared: '已清除裝置座標',
    clear_failed: function(e){ return '清除失敗：' + e; },
    clear_failed_cfg: '清除失敗 - 請檢查模組設定',
    saving: '儲存中...', saved: '✓ 已儲存',
    written: function(lo, la, ts){ return '✓ 已寫入：' + lo.toFixed(6) + ', ' + la.toFixed(6) + ' · ' + ts; },
    saved_toast: '✓ 座標已寫入裝置，下次定位生效',
    save_failed: '✗ 儲存失敗 - 請檢查模組設定', write_failed: '寫入失敗',
    no_geo: '瀏覽器不支援定位', getting_loc: '取得位置中...', got_loc: '已取得目前位置',
    loc_failed: function(m){ return '定位失敗：' + m; },
    paste_first: '請貼上地圖連結或座標', parse_failed: '無法解析座標，請檢查連結格式',
    parsing: '解析中...', parse_unreachable: '解析服務不可達',
    parsed: function(n, lo, la){ return '已解析：' + (n || (lo.toFixed(4) + ', ' + la.toFixed(4))); },
    enter_place: '請輸入地名', searching: '搜尋中...',
    not_found: function(q){ return '未找到：' + q; }, search_failed: '搜尋失敗'
  },
  en: {
    title: 'WLOC Location Spoofer',
    layer_satellite: 'Satellite', layer_wgs84: 'WGS84', layer_amap: 'Amap', layer_color: 'Color', layer_standard: 'Standard', layer_dark: 'Dark',
    amap_title: 'Amap tiles are GCJ-02 offset; picks are auto-converted back to WGS84',
    err_html: '<b>Module not active</b>Please check the following:<br>1. The WLOC location module is installed and enabled<br>2. MITM is on and the certificate is trusted<br>3. The MITM hostname list includes gs-loc.apple.com<br>4. The current network is routed through the proxy',
    choose_title: 'Choose target location',
    coords_hint: 'Tap the map or use the tools below to pick a location',
    radius_label: 'Jitter radius (m)',
    radius_hint: 'Each fix drifts randomly around the target point; 0 = off',
    save: 'Save to Device', add_fav: 'Add Favorite', locate: 'Current Location',
    fav_title: 'Favorites', clear_all: 'Clear All',
    active_title: 'Active coordinates', active_label: 'Device persisted data (wloc_settings)',
    refresh: 'Refresh', clear_data: 'Clear Data',
    paste_title: 'Paste map link', paste_ph: 'Apple / Google / Amap / Baidu map link or coordinates', parse: 'Parse',
    paste_hint: 'Supports Apple Maps · Google Maps · Amap · Baidu · coordinate text',
    search_title: 'Search place', search_ph: 'Enter a place name (e.g. The Bund, Shanghai)', search: 'Search',
    status_hint: 'Pick a location, then tap "Save to Device" to write it to your proxy tool',
    modal_title: 'Add this location to favorites', modal_ph: 'Enter a label (e.g. Office, Home)', cancel: 'Cancel', save_short: 'Save',
    lon: 'Lon', lat: 'Lat', acc: 'Accuracy',
    querying: 'Querying...', no_saved: 'No saved coordinates', query_failed: 'Query failed (requires the proxy module)', cleared: 'Cleared',
    fav_empty: 'No favorites yet. Pick a location and tap "Add Favorite".',
    active_now: '✓ Active now', del: 'Delete',
    pick_first: 'Please pick a location on the map first',
    enter_label: 'Please enter a label',
    added: function(n){ return 'Added: ' + n; },
    deleted: function(n){ return 'Deleted: ' + n; },
    clear_fav_confirm: 'Clear all favorites?', all_cleared: 'All favorites cleared',
    clear_confirm: 'Clear the coordinates saved on the device? After clearing, the module default parameters will be used or location spoofing will stop.',
    dev_cleared: 'Device coordinates cleared',
    clear_failed: function(e){ return 'Clear failed: ' + e; },
    clear_failed_cfg: 'Clear failed - please check the module configuration',
    saving: 'Saving...', saved: '✓ Saved',
    written: function(lo, la, ts){ return '✓ Written: ' + lo.toFixed(6) + ', ' + la.toFixed(6) + ' · ' + ts; },
    saved_toast: '✓ Coordinates written to device, effective on next location fix',
    save_failed: '✗ Save failed - please check the module configuration', write_failed: 'Write failed',
    no_geo: 'Browser does not support geolocation', getting_loc: 'Getting location...', got_loc: 'Current location acquired',
    loc_failed: function(m){ return 'Location failed: ' + m; },
    paste_first: 'Please paste a map link or coordinates', parse_failed: 'Could not parse coordinates, please check the link format',
    parsing: 'Parsing...', parse_unreachable: 'Parse service unreachable',
    parsed: function(n, lo, la){ return 'Parsed: ' + (n || (lo.toFixed(4) + ', ' + la.toFixed(4))); },
    enter_place: 'Please enter a place name', searching: 'Searching...',
    not_found: function(q){ return 'Not found: ' + q; }, search_failed: 'Search failed'
  }
};

function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch(e) {}
  return 'zh'; // default Chinese (Traditional); tap EN to switch (remembered per browser)
}
let lang = detectLang();

function t(key) {
  const v = I18N[lang][key];
  if (typeof v === 'function') return v.apply(null, Array.prototype.slice.call(arguments, 1));
  return v === undefined ? key : v;
}

function applyI18n() {
  document.documentElement.lang = (lang === 'zh' ? 'zh-Hant' : 'en');
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(function(el){ el.textContent = t(el.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-ph]').forEach(function(el){ el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  document.querySelectorAll('[data-i18n-title]').forEach(function(el){ el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  document.querySelectorAll('[data-i18n-html]').forEach(function(el){ el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  document.querySelectorAll('.lang-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-lang') === lang); });
  updateCoords();
  updateStatus();
  renderActive();
  renderFavs();
}

function setLang(l) {
  lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch(e) {}
  applyI18n();
}

function updateCoords() {
  document.getElementById('coords').textContent = selected
    ? (t('lon') + ' ' + lon.toFixed(6) + '  ' + t('lat') + ' ' + lat.toFixed(6))
    : t('coords_hint');
}

function updateStatus() {
  document.getElementById('status').textContent = (savedLon !== null)
    ? t('written', savedLon, savedLat, savedTimeStr)
    : t('status_hint');
}

function renderActive() {
  const el = document.getElementById('activeValue');
  if (activeStatus === 'ok') {
    el.textContent = t('lon') + ' ' + activeLon.toFixed(6) + '  ' + t('lat') + ' ' + activeLat.toFixed(6) + (activeAcc ? ('  ' + t('acc') + ' ' + activeAcc + 'm') : '');
  } else if (activeStatus === 'none') {
    el.textContent = t('no_saved');
  } else if (activeStatus === 'failed') {
    el.textContent = t('query_failed');
  } else if (activeStatus === 'cleared') {
    el.textContent = t('cleared');
  } else {
    el.textContent = t('querying');
  }
}

const map = L.map('map').setView([lat, lon], 13);
const tiles = {
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, attribution:'ArcGIS'}),
  wgs84: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {maxZoom:19, attribution:'ArcGIS WGS84'}),
  standard: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'\\u00a9 OSM'}),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {maxZoom:19, attribution:'\\u00a9 Carto'}),
  amap: L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {maxZoom:18, subdomains:'1234', attribution:'\\u00a9 高德'}),
  voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {maxZoom:19, attribution:'\\u00a9 Carto'})
};
let currentLayer = tiles.satellite;
currentLayer.addTo(map);
function switchLayer(name) {
  map.removeLayer(currentLayer);
  currentLayer = tiles[name];
  currentLayer.addTo(map);
  layerIsGcj = (name === 'amap');
  // 底图坐标系变了, 同一个 WGS84 点对应的屏幕位置也就变了, marker 必须重摆,
  // 否则切换图层后它会停在旧图源的像素位置上, 看起来像是坐标被改掉了。
  const d = toDisplay(lat, lon);
  marker.setLatLng([d.lat, d.lon]);
  map.setView([d.lat, d.lon], map.getZoom());
  document.querySelectorAll('.layer-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === name));
}
let marker = L.marker([lat, lon], {draggable:true}).addTo(map);

// 地图交互给出的都是「屏幕坐标系」的读数, 一律先过 fromDisplay 再进 setPos。
marker.on('dragend', e => { const p=e.target.getLatLng(); setPosFromDisplay(p.lat, p.lng); });
map.on('click', e => { setPosFromDisplay(e.latlng.lat, e.latlng.lng); });

function setPosFromDisplay(dLat, dLon) {
  const w = fromDisplay(dLat, dLon);
  setPos(w.lat, w.lon);
}

// 参数恒为 WGS84。
function setPos(newLat, newLon) {
  lat = newLat; lon = newLon; selected = true;
  const d = toDisplay(lat, lon);
  marker.setLatLng([d.lat, d.lon]);
  updateCoords();
}

function moveTo(newLat, newLon, zoom) {
  setPos(newLat, newLon);
  const d = toDisplay(lat, lon);
  map.setView([d.lat, d.lon], zoom || 15);
}

function toast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms || 2500);
}

function showError(show) {
  document.getElementById('errorBanner').style.display = show ? 'block' : 'none';
}

/* ---- Favorites (localStorage) ---- */
function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch(e) { return []; }
}
function saveFavs(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

function renderFavs() {
  const favs = getFavs();
  const el = document.getElementById('favList');
  const clearBtn = document.getElementById('clearAllBtn');
  clearBtn.style.display = favs.length ? '' : 'none';
  if (!favs.length) {
    el.innerHTML = '<div class="fav-empty">' + escHtml(t('fav_empty')) + '<\\/div>';
    return;
  }
  el.innerHTML = favs.map((f, i) => {
    const isActive = activeLon !== null && Math.abs(f.lon - activeLon) < 0.000001 && Math.abs(f.lat - activeLat) < 0.000001;
    return '<div class="fav-item" onclick="loadFav(' + i + ')">' +
      '<div class="fav-info">' +
        '<div class="fav-name">' + escHtml(f.name) + '<\\/div>' +
        '<div class="fav-coords">' + f.lon.toFixed(6) + ', ' + f.lat.toFixed(6) + '<\\/div>' +
        (isActive ? '<div class="fav-active">' + escHtml(t('active_now')) + '<\\/div>' : '') +
      '<\\/div>' +
      '<button class="fav-del" aria-label="' + escHtml(t('del')) + '" onclick="event.stopPropagation();delFav(' + i + ')" title="' + escHtml(t('del')) + '">\\u00d7<\\/button>' +
    '<\\/div>';
  }).join('');
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function addFav() {
  if (!selected) { toast(t('pick_first')); return; }
  document.getElementById('favModalCoords').textContent = lon.toFixed(6) + ', ' + lat.toFixed(6);
  document.getElementById('favNameInput').value = '';
  document.getElementById('favModal').classList.add('show');
  document.getElementById('favNameInput').focus();
}

document.getElementById('favModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeFavModal(); });

function closeFavModal() {
  document.getElementById('favModal').classList.remove('show');
}

function confirmFav() {
  const name = document.getElementById('favNameInput').value.trim();
  if (!name) { toast(t('enter_label')); return; }
  const favs = getFavs();
  favs.push({ name, lon, lat, time: new Date().toISOString() });
  saveFavs(favs);
  closeFavModal();
  renderFavs();
  toast(t('added', name));
}

function loadFav(i) {
  const favs = getFavs();
  if (!favs[i]) return;
  moveTo(favs[i].lat, favs[i].lon, 15);
  toast(favs[i].name + ' (' + favs[i].lon.toFixed(4) + ', ' + favs[i].lat.toFixed(4) + ')');
}

function delFav(i) {
  const favs = getFavs();
  if (!favs[i]) return;
  const name = favs[i].name;
  favs.splice(i, 1);
  saveFavs(favs);
  renderFavs();
  toast(t('deleted', name));
}

function clearAllFav() {
  if (!confirm(t('clear_fav_confirm'))) return;
  saveFavs([]);
  renderFavs();
  toast(t('all_cleared'));
}

/* ---- Active location query ---- */
function queryActive() {
  activeStatus = 'querying';
  renderActive();
  fetch(SAVE_API + '?action=query', { method:'GET', mode:'cors', cache:'no-store', signal: AbortSignal.timeout(8000) })
    .then(r => r.json())
    .then(d => {
      if (d.success && d.longitude != null && d.latitude != null) {
        activeLon = parseFloat(d.longitude);
        activeLat = parseFloat(d.latitude);
        activeAcc = d.accuracy || null;
        activeStatus = 'ok';
        const rr = d.randomRadius || 0;
        document.getElementById('radiusInput').value = rr;
      } else {
        activeLon = null; activeLat = null; activeAcc = null;
        activeStatus = 'none';
      }
      renderActive();
      renderFavs();
    })
    .catch(() => { activeStatus = 'failed'; renderActive(); });
}

function clearActive() {
  if (!confirm(t('clear_confirm'))) return;
  fetch(SAVE_API + '?action=clear', { method:'GET', mode:'cors', cache:'no-store', signal: AbortSignal.timeout(8000) })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        activeLon = null; activeLat = null; activeAcc = null;
        activeStatus = 'cleared';
        renderActive();
        renderFavs();
        toast(t('dev_cleared'));
      } else { toast(t('clear_failed', d.error || ''), 3000); }
    })
    .catch(() => { toast(t('clear_failed_cfg'), 3000); });
}

/* ---- Save to device ---- */
async function save() {
  if (!selected) { toast(t('pick_first')); return; }
  const btn = document.getElementById('saveBtn');
  btn.textContent = t('saving'); btn.disabled = true;
  showError(false);
  try {
    const radius = parseInt(document.getElementById('radiusInput').value) || 0;
    const r = await fetch(SAVE_API + '?lon=' + lon + '&lat=' + lat + '&acc=25&randomRadius=' + radius, {
      method: 'GET', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    if (d.success) {
      activeLon = lon; activeLat = lat; activeAcc = 25; activeStatus = 'ok';
      savedLon = lon; savedLat = lat;
      savedTimeStr = new Date().toLocaleTimeString(lang === 'zh' ? 'zh-TW' : 'en-US');
      btn.textContent = t('saved'); btn.className = 'btn btn-primary success';
      updateStatus();
      renderActive();
      renderFavs();
      toast(t('saved_toast'));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { btn.textContent = t('save'); btn.className='btn btn-primary'; btn.disabled=false; }, 2500);
    } else {
      throw new Error(d.error || t('write_failed'));
    }
  } catch(e) {
    btn.textContent = t('save'); btn.className = 'btn btn-primary'; btn.disabled = false;
    showError(true);
    toast(t('save_failed'), 4000);
  }
}

function locateMe() {
  if (!navigator.geolocation) return toast(t('no_geo'));
  toast(t('getting_loc'));
  navigator.geolocation.getCurrentPosition(
    pos => { moveTo(pos.coords.latitude, pos.coords.longitude, 16); toast(t('got_loc')); },
    err => toast(t('loc_failed', err.message), 3000),
    { enableHighAccuracy:true, timeout:10000 }
  );
}

function parseMapUrl(text) {
  let m;
  m = text.match(/ll=([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  m = text.match(/@([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  m = text.match(/lnglat=([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
  m = text.match(/(?:location|center)=([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
  m = text.match(/(-?[0-9]+\\.[0-9]+)[,\\s]+(-?[0-9]+\\.[0-9]+)/);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    // 纬度绝对值不超过 90, 经度可达 180: 按绝对值判断谁是经度, 否则
    // -122.009 这类西经会被当成纬度 (-122 < 90 恒成立)。
    if (Math.abs(a) <= 90 && Math.abs(b) > 90) return { lat: a, lon: b };
    if (Math.abs(b) <= 90 && Math.abs(a) > 90) return { lat: b, lon: a };
    return { lat: a, lon: b };
  }
  return null;
}

// 含链接的输入交给服务端 /api/parse: 浏览器读不到跨域 302 的 Location 头, 短链
// 只能由 worker 展开; 服务端还认 coordinate= 并按来源做 GCJ-02->WGS84 换算。
// 纯坐标文本本地直接解析 —— 它也是唯一不需要坐标系换算的输入, 免去一次往返。
async function parseUrl() {
  const input = document.getElementById('urlInput').value.trim();
  if (!input) return toast(t('paste_first'));

  const low = input.toLowerCase();
  if (low.includes('http://') || low.includes('https://')) {
    toast(t('parsing'));
    let data;
    try {
      const r = await fetch('/api/parse?format=json&u=' + encodeURIComponent(input), { signal: AbortSignal.timeout(8000) });
      data = await r.json();
    } catch (e) {
      toast(t('parse_unreachable'), 3000);
      return;
    }
    if (!data || data.error || typeof data.lat !== 'number') {
      toast(data && data.error ? data.error : t('parse_failed'), 3000);
      return;
    }
    moveTo(data.lat, data.lon, 15);
    toast(t('parsed', data.name, data.lon, data.lat));
    return;
  }

  const result = parseMapUrl(input);
  if (!result) { toast(t('parse_failed'), 3000); return; }
  moveTo(result.lat, result.lon, 15);
  toast(t('parsed', '', result.lon, result.lat));
}

async function searchPlace() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return toast(t('enter_place'));
  toast(t('searching'));
  try {
    // Worker route /api/search proxies Nominatim through the Cloudflare edge
    // cache (7d). Browser-direct Nominatim hits its rate limits and policy.
    const r = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const results = (d && d.results) || [];
    if (!results.length) { toast(t('not_found', q), 3000); return; }
    const p = results[0];
    moveTo(p.lat, p.lon, 15);
    toast(String(p.name || p.detail || '').slice(0, 40));
  } catch(e) { toast(t('search_failed'), 3000); }
}

document.addEventListener('paste', e => {
  const tgt = e.target;
  if (tgt !== document.body && tgt !== document.getElementById('urlInput')) return;
  const text = (e.clipboardData||window.clipboardData).getData('text');
  if (!text) return;
  if (!(text.includes('map') || text.includes('loc') || text.includes('lnglat') || /[0-9]+\\.[0-9]+/.test(text))) return;
  const input = document.getElementById('urlInput');
  // If the paste target already IS this input, let the browser insert natively;
  // assigning again would append the same text twice.
  if (e.target !== input) input.value = text;
  setTimeout(parseUrl, 200);
});
document.getElementById('searchInput').addEventListener('keydown', e => { if(e.key==='Enter') searchPlace(); });
document.getElementById('urlInput').addEventListener('keydown', e => { if(e.key==='Enter') parseUrl(); });
document.getElementById('favNameInput').addEventListener('keydown', e => { if(e.key==='Enter') confirmFav(); });

applyI18n();
queryActive();
<\/script>
</body>
</html>`;
}
