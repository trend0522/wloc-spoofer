import { GCJ_BROWSER_JS } from "./gcj-browser.js";
import { COORD_JS } from "./coord.js";

export function getPageHtml() {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>WLOC 虛擬定位</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="WLOC">
<!-- 内联图标: 没有它浏览器每次加载都会去要 /favicon.ico 并拿到 404 -->
<script>try{var _th=localStorage.getItem('theme');if(_th==='dark'||_th==='light')document.documentElement.setAttribute('data-theme',_th);}catch(e){}<\/script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%93%8D%3C/text%3E%3C/svg%3E">
<!-- integrity 为 Leaflet 官方在 leafletjs.com/download.html 公布的 SRI 值,
     可自行核对。CDN 被篡改时浏览器会拒绝执行, 下面的 typeof L 检查会给出提示。 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous"/>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"><\/script>
<style>
:root { color-scheme:light; --blue:#0062d9; --green:#1e7a35; --red:#b3261e; --gray:#4b5563; --bg:#f2f2f7; --orange:#ff9500; --card:#fff; --line:#d1d1d6; --text:#1f2937; --chip:#e5e5ea; --glass:rgba(255,255,255,.92); --on-accent:#fff; --edge:transparent; --danger-on:#fff; --danger-invert:#fff; }
/* ponytail: 三軌主題只覆蓋 token, 規則零重複。data-theme=light 靠 html:not([data-theme]) 排他壓回亮; 手動暗 > auto跟系統 > 預設亮 */
html[data-theme=dark] { color-scheme:dark; --blue:#0a84ff; --green:#30d158; --red:#ff453a; --gray:#a1a1a6; --bg:#0b0b0d; --card:#1c1c1e; --line:#38383a; --text:#ebebf0; --chip:#2c2c2e; --glass:rgba(28,28,30,.92); --on-accent:#0b0b0d; --edge:#38383a; --danger-on:#0b0b0d; --danger-invert:#0b0b0d; }
@media (prefers-color-scheme: dark) { html:not([data-theme]) { color-scheme:dark; --blue:#0a84ff; --green:#30d158; --red:#ff453a; --gray:#a1a1a6; --bg:#0b0b0d; --card:#1c1c1e; --line:#38383a; --text:#ebebf0; --chip:#2c2c2e; --glass:rgba(28,28,30,.92); --on-accent:#0b0b0d; --edge:#38383a; --danger-on:#0b0b0d; --danger-invert:#0b0b0d; } }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,system-ui,"SF Pro","Helvetica Neue",sans-serif; background:var(--bg); overscroll-behavior-y:none; }
#map { height:50vh; width:100%; min-height:250px; }
.panel { padding:16px; max-width:600px; margin:0 auto; }
.card { background:var(--card); border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
.card h3 { font-size:15px; font-weight:600; margin-bottom:10px; color:var(--text); }
.coords { font-family:"SF Mono",monospace; font-size:14px; color:var(--text); padding:8px 12px; background:var(--bg); border-radius:8px; word-break:break-all; cursor:pointer; }
.row { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
.btn { flex:1; min-width:100px; padding:12px 16px; border:none; border-radius:10px; font-size:14px; font-weight:500; cursor:pointer; transition:all .15s; }
.btn-primary { background:var(--blue); color:var(--on-accent); }
.btn-primary:active { filter:brightness(.85); transform:scale(.97); }
.btn-secondary { background:var(--chip); color:var(--text); }
.btn-secondary:active { filter:brightness(.92); transform:scale(.97); }
.btn-danger { background:var(--red); color:var(--danger-on); }
.btn-danger:active { filter:brightness(.85); transform:scale(.97); }
.btn.success { background:var(--green); color:var(--on-accent); }
.btn:disabled { opacity:.6; }
.btn:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.btn-sm { flex:none; min-width:auto; padding:6px 12px; min-height:40px; font-size:13px; border-radius:8px; }
.input-row { display:flex; gap:8px; margin-top:10px; }
.input-row input { flex:1; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-size:14px; outline:none; min-width:0; background:var(--card); color:var(--text); }
#searchResults { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
#searchResults .sres { text-align:left; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--text); font-size:13px; cursor:pointer; }
.input-row input::placeholder { color:var(--gray); }
.input-row input:focus { border-color:var(--blue); }
.status { font-size:13px; color:var(--gray); margin-top:8px; text-align:center; }
.error-banner { background:var(--red); color:var(--danger-on); padding:14px 16px; border-radius:12px; margin-bottom:12px; font-size:14px; line-height:1.5; display:none; }
.error-banner b { display:block; margin-bottom:4px; }
.error-banner .retry-btn { margin-top:10px; background:var(--danger-invert); color:var(--red); border:none; border-radius:8px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; min-height:36px; }
.toast { position:fixed; top:60px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,.8); color:#fff; padding:10px 20px; border-radius:20px; font-size:14px; opacity:0; transition:opacity .3s; pointer-events:none; z-index:9999; max-width:90vw; text-align:center; }
.toast.show { opacity:1; }
.active-loc { background:var(--bg); border-radius:8px; padding:10px 12px; font-size:13px; color:var(--text); }
.active-loc .label { font-size:13px; color:var(--gray); margin-bottom:4px; }
.active-loc .value { font-family:"SF Mono",monospace; font-size:13px; }
.fav-list { max-height:240px; overflow-y:auto; }
.fav-item { display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--bg); border-radius:8px; margin-bottom:6px; transition:background .15s; }
.fav-item:active { background:var(--chip); }
.fav-item .fav-info { flex:1; min-width:0; }
.fav-item .fav-name { font-size:14px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.fav-item .fav-coords { font-size:13px; color:var(--gray); font-family:"SF Mono",monospace; margin-top:2px; }
.fav-item .fav-active { font-size:12px; color:var(--green); font-weight:600; }
.fav-item .fav-del { flex:none; width:32px; height:32px; position:relative; border:none; border-radius:50%; background:transparent; color:var(--red); font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s; }
.fav-item .fav-del::before { content:""; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:44px; height:44px; }
.fav-item .fav-del:hover { background:color-mix(in srgb, var(--red) 12%, transparent); }
.fav-item .fav-del:focus-visible { outline:2px solid var(--red); outline-offset:1px; }
.fav-btn { display:flex; flex:1; align-items:center; gap:8px; min-width:0; background:transparent; border:none; padding:0; font:inherit; color:inherit; text-align:left; cursor:pointer; border-radius:6px; }
.fav-btn:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.fav-empty { text-align:center; color:var(--gray); font-size:13px; padding:16px 0; }
.fav-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.fav-header h3 { margin-bottom:0; }
.modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.4); z-index:10000; display:none; align-items:center; justify-content:center; padding:20px; }
.modal-overlay.show { display:flex; }
.modal { background:var(--card); border-radius:16px; padding:20px; width:100%; max-width:340px; color:var(--text); }
.modal h3 { font-size:17px; font-weight:600; margin-bottom:16px; text-align:center; }
.modal input { width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; font-size:15px; outline:none; margin-bottom:12px; background:var(--bg); color:var(--text); }
.modal input:focus { border-color:var(--blue); }
.modal .modal-btns { display:flex; gap:8px; }
.modal .modal-btns .btn { padding:12px; }
/* P1a/P1c/主題: 控件收進一條 map-controls, 圖層改 popover; .chip-row 玻璃底 + var(--edge) 深色描邊 */
.map-controls { position:absolute; top:10px; left:10px; right:10px; z-index:1000; display:flex; justify-content:space-between; align-items:flex-start; gap:8px; pointer-events:none; }
.map-controls > * { pointer-events:auto; }
.chip-row { display:flex; align-items:center; flex-wrap:wrap; gap:2px; background:var(--glass); border:1px solid var(--edge); border-radius:10px; padding:4px; box-shadow:0 2px 8px rgba(0,0,0,.15); min-height:44px; }
.layer-btn, .lang-btn, .theme-btn { display:flex; align-items:center; gap:5px; border:none; background:transparent; padding:6px 11px; min-height:44px; border-radius:8px; font-size:13px; font-weight:600; color:var(--text); cursor:pointer; transition:background .15s, transform .15s; white-space:nowrap; }
.layer-btn[aria-expanded=true] { background:color-mix(in srgb, var(--blue) 16%, var(--chip)); }
.layer-btn:active, .lang-btn:active, .theme-btn:active { transform:scale(.95); }
.lang-btn.active { background:color-mix(in srgb, var(--blue) 16%, var(--chip)); }
.theme-btn { padding:6px 8px; }
.theme-btn svg { width:18px; height:18px; display:block; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; }
button:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.popover { position:fixed; top:60px; right:10px; z-index:1100; background:var(--card); border:1px solid var(--edge); border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.25); padding:6px; width:232px; max-height:70vh; overflow:auto; }
.popover.hidden { display:none; }
.popover h4 { font-size:13px; font-weight:600; color:var(--gray); letter-spacing:.4px; padding:8px 10px 4px; }
.layer-opt { display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:8px; cursor:pointer; }
.layer-opt:hover { background:var(--bg); }
.layer-opt input { position:absolute; opacity:0; pointer-events:none; }
.l-name { font-size:14px; font-weight:600; color:var(--text); }
.layer-opt input:checked ~ .l-name { color:var(--blue); }
.l-desc { font-size:13px; color:var(--gray); line-height:1.35; }
/* P1c: 手機黏著列; 桌面 (>768px) 完全不顯示, 面板多留底部空間 */
#stickyBar { position:fixed; left:0; right:0; bottom:0; z-index:1001; display:none; align-items:center; gap:10px; background:var(--glass); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border-top:1px solid var(--edge); padding:10px 12px calc(10px + env(safe-area-inset-bottom)); }
#stickyBar .sb-coords { flex:1; min-width:0; font-family:"SF Mono",monospace; font-size:13px; line-height:1.3; color:var(--gray); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#stickyBar input { width:64px; flex:none; padding:8px; border:1px solid var(--line); border-radius:8px; font-size:14px; background:var(--card); color:var(--text); }
#stickyBar .btn { flex:none; min-width:110px; }
.leaflet-bottom.leaflet-right .leaflet-control-zoom { border:1px solid var(--edge); box-shadow:0 2px 8px rgba(0,0,0,.15); }
@media(max-width:768px) { #stickyBar { display:flex; } .panel { padding-bottom:120px; } }
@media(min-width:769px) { #stickyBar { display:none !important; } }
@media(max-width:480px) { #map { height:44vh; } .panel { padding:12px 12px 120px; } }
@media(max-width:768px) { /* sticky bar 接管座標/半徑/儲存, 卡內不重複出现 */ .radius-row { display:none; } #saveBtn { display:none; } }
</style>
</head>
<body>
<div style="position:relative">
<div id="map"></div>
<div class="map-controls">
  <div class="chip-row">
    <button class="lang-btn" data-lang="zh" onclick="setLang('zh')">繁</button>
    <button class="lang-btn" data-lang="en" onclick="setLang('en')">EN</button>
  </div>
  <div class="chip-row">
    <button class="theme-btn" id="themeBtn" type="button" aria-label="主題">
      <svg viewBox="0 0 24 24" id="themeIcon" aria-hidden="true"></svg>
    </button>
    <button class="layer-btn" id="layerBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="layerPopover" data-i18n="layers" onclick="toggleLayerPopover()">圖層</button>
  </div>
</div>
<div class="popover hidden" id="layerPopover" role="group" aria-label="圖層">
  <h4 data-i18n="layer_group_base">Basemap</h4>
  <label class="layer-opt"><input type="radio" name="layer" value="satellite" checked onclick="switchLayer('satellite')"><span class="l-name" data-i18n="layer_satellite">Satellite</span><span class="l-desc" data-i18n="layer_satellite_d">Global satellite imagery</span></label>
  <label class="layer-opt"><input type="radio" name="layer" value="wgs84" onclick="switchLayer('wgs84')"><span class="l-name" data-i18n="layer_wgs84">WGS84</span><span class="l-desc" data-i18n="layer_wgs84_d">Street map, no offset</span></label>
  <label class="layer-opt"><input type="radio" name="layer" value="voyager" onclick="switchLayer('voyager')"><span class="l-name" data-i18n="layer_color">Color</span><span class="l-desc" data-i18n="layer_color_d">Colourful street style</span></label>
  <label class="layer-opt"><input type="radio" name="layer" value="standard" onclick="switchLayer('standard')"><span class="l-name" data-i18n="layer_standard">Standard</span><span class="l-desc" data-i18n="layer_standard_d">OpenStreetMap street</span></label>
  <label class="layer-opt"><input type="radio" name="layer" value="dark" onclick="switchLayer('dark')"><span class="l-name" data-i18n="layer_dark">Dark</span><span class="l-desc" data-i18n="layer_dark_d">Dark street style</span></label>
  <h4 data-i18n="layer_group_china">China maps</h4>
  <label class="layer-opt" data-i18n-title="amap_title"><input type="radio" name="layer" value="amap" onclick="switchLayer('amap')"><span class="l-name" data-i18n="layer_amap">Amap</span><span class="l-desc" data-i18n="layer_amap_d">China map data, offset auto-corrected</span></label>
</div>
</div>
<div class="panel">
  <div class="error-banner" id="errorBanner" role="alert">
  <div data-i18n-html="err_html"></div>
  <button type="button" class="retry-btn" id="retryBtn" data-i18n="retry" onclick="retryLastAction()">Retry</button>
</div>
  <div class="card">
    <h3 data-i18n="choose_title">Choose target location</h3>
    <div class="coords" id="coords">Tap the map or use the tools below to pick a location</div>
    <div class="input-row radius-row" style="margin-top:10px">
      <label style="font-size:13px;color:var(--gray);display:flex;align-items:center;gap:6px;white-space:nowrap"><span data-i18n="radius_label">Jitter radius (m)</span>
        <input id="radiusInput" type="number" min="0" max="5000" step="1" value="0" style="width:80px;flex:none" aria-label="Jitter radius in meters" />
      </label>
      <span style="font-size:13px;color:var(--gray);line-height:1.3" data-i18n="radius_hint">Each fix drifts randomly around the target point; 0 = off</span>
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
      <button class="btn btn-sm btn-secondary" data-i18n="refresh" onclick="showError(false);queryActive()">Refresh</button>
      <button class="btn btn-sm btn-danger" data-i18n="clear_data" onclick="clearActive()">Clear Data</button>
    </div>
  </div>
  <div class="card">
    <h3 data-i18n="paste_title">Paste map link</h3>
    <div class="input-row">
      <input id="urlInput" data-i18n-ph="paste_ph" placeholder="Apple/Google/Amap/Baidu map link or coordinates" aria-label="Map link or coordinates" />
      <button class="btn btn-secondary" style="flex:none;min-width:56px" data-i18n="parse" onclick="parseUrl()">Parse</button>
    </div>
    <div style="font-size:13px;color:var(--gray);margin-top:6px" data-i18n="paste_hint">Supports Apple Maps · Google Maps · Amap · Baidu · coordinate text</div>
  </div>
  <div class="card">
    <h3 data-i18n="search_title">Search place</h3>
    <div class="input-row">
      <input id="searchInput" data-i18n-ph="search_ph" placeholder="Enter a place name (e.g. The Bund, Shanghai)" aria-label="Place name search" />
      <button class="btn btn-secondary" style="flex:none;min-width:56px" data-i18n="search" onclick="searchPlace()">Search</button>
    </div>
    <div id="searchResults"></div>
  </div>
  <div class="status" id="status" aria-live="polite">Pick a location, then tap "Save to Device" to write it to your proxy tool</div>
</div>
<div id="stickyBar">
  <span class="sb-coords" id="sbCoords"></span>
  <input id="stickyRadius" type="number" min="0" max="5000" step="1" value="0" data-i18n-aria="radius_label" aria-label="Jitter radius in meters" />
  <button class="btn btn-primary" id="stickySave" data-i18n="save" onclick="save()" disabled>Save to Device</button>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="modal-overlay" id="favModal">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="favModalTitle">
    <h3 id="favModalTitle" data-i18n="modal_title">Add this location to favorites</h3>
    <input id="favNameInput" data-i18n-ph="modal_ph" placeholder="Enter a label (e.g. Office, Home)" maxlength="30" aria-label="Favorite label" />
    <div style="font-size:13px;color:var(--gray);margin-bottom:12px;text-align:center" id="favModalCoords"></div>
    <div class="modal-btns">
      <button class="btn btn-secondary" data-i18n="cancel" onclick="closeFavModal()">Cancel</button>
      <button class="btn btn-primary" data-i18n="save_short" onclick="confirmFav()">Save</button>
    </div>
  </div>
</div>
<script>
if (typeof L === 'undefined') {
  document.getElementById('map').innerHTML =
    '<div style="padding:24px;text-align:center;font-size:14px;color:var(--gray);line-height:1.6">' +
    '地圖庫載入失敗<br>jsdelivr CDN 不可達，請檢查網路或代理後重新整理<\\/div>';
  throw new Error('leaflet unavailable');
}
${GCJ_BROWSER_JS}
${COORD_JS}
const SAVE_API = 'https://gs-loc.apple.com/wloc-settings/save';
const FAV_KEY = 'wloc_favorites';
const LANG_KEY = 'wloc_lang';
// lat/lon 恒为 WGS84 —— 这是写进设备、也是 wloc 唯一认的坐标系。
// 底图可能是 GCJ-02 图源, 屏幕上的经纬度与它并不相等, 换算集中在 toDisplay/
// fromDisplay 两个函数里, 其它地方一律不碰。
let lat = 22.544577, lon = 113.94114;
let selected = false;
let activeLon = null, activeLat = null, activeAcc = null, activeStatus = 'querying';
let firstFail = false; // 首次載入查詢失敗 = 待機語氣（不出橫幅）
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
    layers: '圖層', layer_group_base: '底圖', layer_group_china: '中國地圖',
    layer_satellite_d: '全球衛星影像', layer_wgs84_d: '街道圖，無偏移', layer_color_d: '彩色街道風格', layer_standard_d: 'OSM 街道圖', layer_dark_d: '暗色街道風格', layer_amap_d: '中國地圖圖資，自動校正偏移',
    retry: '重試',
    theme_auto: '自動', theme_light: '亮色', theme_dark: '深色',
    theme_aria: function(n){ return '主題：' + n + '（點擊切換）'; },
    theme_set: function(n){ return '主題：' + n; },
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
    querying: '查詢中...', no_saved: '無已儲存的座標', query_failed: '尚未連線到代理模組——完成設定後點「重新整理」', cleared: '已清除',
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
    not_found: function(q){ return '未找到：' + q; }, search_failed: '搜尋失敗',
    invalid_coord: '座標超出合法範圍（緯度 ±90、經度 ±180）',
    copied: '已複製座標', copy_failed: '複製失敗，請手動選取'
  },
  en: {
    title: 'WLOC Location Spoofer',
    layer_satellite: 'Satellite', layer_wgs84: 'WGS84', layer_amap: 'Amap', layer_color: 'Color', layer_standard: 'Standard', layer_dark: 'Dark',
    amap_title: 'Amap tiles are GCJ-02 offset; picks are auto-converted back to WGS84',
    layers: 'Layers', layer_group_base: 'Basemap', layer_group_china: 'China maps',
    layer_satellite_d: 'Global satellite imagery', layer_wgs84_d: 'Streets, no offset', layer_color_d: 'Colourful street style', layer_standard_d: 'OSM street map', layer_dark_d: 'Dark street style', layer_amap_d: 'China map data, offset auto-corrected',
    retry: 'Retry',
    theme_auto: 'Auto', theme_light: 'Light', theme_dark: 'Dark',
    theme_aria: function(n){ return 'Theme: ' + n + ' (tap to cycle)'; },
    theme_set: function(n){ return 'Theme: ' + n; },
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
    querying: 'Querying...', no_saved: 'No saved coordinates', query_failed: 'Not connected to the proxy module — finish setup, then tap Refresh', cleared: 'Cleared',
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
    not_found: function(q){ return 'Not found: ' + q; }, search_failed: 'Search failed',
    invalid_coord: 'Coordinates out of range (latitude ±90, longitude ±180)',
    copied: 'Coordinates copied', copy_failed: 'Copy failed, select manually'
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

/* ---- Theme (auto|light|dark; localStorage key 'theme', default auto) ---- */
const THEME_KEY = 'theme';
const THEME_ORDER = ['auto', 'light', 'dark'];
function detectTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch(e) {}
  return 'auto';
}
let theme = detectTheme();
function themeName() { return t('theme_' + theme); }
function applyTheme() {
  // auto => no attribute: the prefers-color-scheme block owns it; light/dark win via [data-theme].
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  renderThemeBtn();
}
function renderThemeBtn() {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  const svg = {
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 1 0 18" fill="currentColor" stroke="none"/>',
    light: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19"/>',
    dark: '<path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a7 7 0 0 0 9.5 9.5z"/>'
  }[theme];
  icon.innerHTML = svg;
  const btn = document.getElementById('themeBtn');
  btn.setAttribute('aria-label', t('theme_aria', themeName()));
  btn.setAttribute('aria-pressed', theme !== 'auto' ? 'true' : 'false');
}
function cycleTheme() {
  theme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % 3];
  try { localStorage.setItem(THEME_KEY, theme); } catch(e) {}
  applyTheme();
  announce(t('theme_set', themeName()));
}
document.getElementById('themeBtn').addEventListener('click', cycleTheme);
// auto follows the system live (only while in auto mode)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){ if (theme === 'auto') announce(t('theme_set', themeName())); });
// announce() reuses the toast element (role=status aria-live=polite already on it)
function announce(msg) { toast(msg, 1500); }

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
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el){ el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
  document.querySelectorAll('[data-i18n-html]').forEach(function(el){ el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  document.querySelectorAll('.lang-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-lang') === lang); });
  renderThemeBtn();
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
  syncSticky();
}

// P1c: sticky bar mirrors coords + save state. #radiusInput stays the single
// source of truth (save() reads it); stickyRadius just syncs both ways.
function syncSticky() {
  const sticky = document.getElementById('stickySave');
  if (!sticky) return;
  document.getElementById('sbCoords').textContent = selected ? (lon.toFixed(6) + ', ' + lat.toFixed(6)) : t('coords_hint');
  if (!sticky.classList.contains('busy')) sticky.disabled = !selected;
}
document.getElementById('radiusInput').addEventListener('input', e => { document.getElementById('stickyRadius').value = e.target.value; });
document.getElementById('stickyRadius').addEventListener('input', e => { document.getElementById('radiusInput').value = e.target.value; });

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
    el.style.color = firstFail ? 'var(--gray)' : 'var(--text)';
  } else if (activeStatus === 'cleared') {
    el.textContent = t('cleared');
  } else {
    el.textContent = t('querying');
  }
}

const map = L.map('map').setView([lat, lon], 13); map.zoomControl.setPosition('bottomright');
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
  if (currentLayer === tiles[name]) { /* re-selecting current layer: just close menu */ toggleLayerPopover(false); return; }
  map.removeLayer(currentLayer);
  toggleLayerPopover(false);
  currentLayer = tiles[name];
  currentLayer.addTo(map);
  layerIsGcj = (name === 'amap');
  // 底图坐标系变了, 同一个 WGS84 点对应的屏幕位置也就变了, marker 必须重摆,
  // 否则切换图层后它会停在旧图源的像素位置上, 看起来像是坐标被改掉了。
  const d = toDisplay(lat, lon);
  marker.setLatLng([d.lat, d.lon]);
  map.setView([d.lat, d.lon], map.getZoom());
  document.querySelectorAll('#layerPopover input').forEach(r => { r.checked = (r.value === name); });
}
/* ---- Layer popover (P1a): one button, grouped menu; layer objects/behaviour unchanged ---- */
function toggleLayerPopover(force) {
  const p = document.getElementById('layerPopover');
  const open = force !== undefined ? force : p.classList.contains('hidden');
  p.classList.toggle('hidden', !open);
  document.getElementById('layerBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  return open;
}
document.addEventListener('click', function(e){
  const p = document.getElementById('layerPopover');
  if (!p.classList.contains('hidden') && !p.contains(e.target) && !document.getElementById('layerBtn').contains(e.target)) toggleLayerPopover(false);
});

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
  // P0-1 單一守門點: 地圖點選/拖 marker/搜尋選點/收藏還原/連結解析/網址預填
  // 全部經過這裡, 非法座標一律拒絕 —— 不設 selected、不動上一筆有效值。
  if (!validCoord(newLat, newLon)) { toast(t('invalid_coord'), 3000); return; }
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
  setTimeout(() => t.classList.remove('show'), ms || 1500);
}

let lastAction = null; // 'save' | 'query' — what the retry button re-runs
function showError(show, action) {
  if (action !== undefined) lastAction = action;
  document.getElementById('errorBanner').style.display = show ? 'block' : 'none';
}
function retryLastAction() {
  showError(false);
  if (lastAction === 'query') queryActive(); else save();
}
// First-load query failure is a waiting state, not an error: neutral copy, no banner.
function showQueryFailure(firstLoad) {
  activeStatus = 'failed';
  firstFail = !!firstLoad;
  renderActive();
  // 首次失敗 = 中性待機（activeValue 帶文案，下方既有「重新整理」鈕）; 手動失敗 = 橫幅當唯一錯誤面
  if (!firstLoad) showError(true, 'query');
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
    return '<div class="fav-item">' +
      '<button type="button" class="fav-btn" onclick="loadFav(' + i + ')">' +
        '<div class="fav-info">' +
          '<div class="fav-name">' + escHtml(f.name) + '<\\/div>' +
          '<div class="fav-coords">' + f.lon.toFixed(6) + ', ' + f.lat.toFixed(6) + '<\\/div>' +
          (isActive ? '<div class="fav-active">' + escHtml(t('active_now')) + '<\\/div>' : '') +
        '<\\/div>' +
      '<\\/button>' +
      '<button type="button" class="fav-del" aria-label="' + escHtml(t('del')) + ' ' + escHtml(f.name) + '" onclick="delFav(' + i + ')" title="' + escHtml(t('del')) + '">\\u00d7<\\/button>' +
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
  openFavModal();
}

function openFavModal() {
  modalOpener = document.activeElement;
  document.getElementById('favModal').classList.add('show');
  document.getElementById('favNameInput').focus();
}

document.getElementById('favModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeFavModal(); });

// P2-2: Esc 關閉 + Tab 循環（簡易 focus trap）; aria-modal 在 .modal 元素上。
let modalOpener = null;
document.addEventListener('keydown', e => {
  const m = document.getElementById('favModal');
  if (!m.classList.contains('show')) { if (e.key === 'Escape') toggleLayerPopover(false); return; }
  if (e.key === 'Escape') { closeFavModal(); return; }
  if (e.key === 'Tab') {
    const items = m.querySelectorAll('.modal button, .modal input');
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }
});

function closeFavModal() {
  document.getElementById('favModal').classList.remove('show');
  if (modalOpener && modalOpener.focus) modalOpener.focus();
  modalOpener = null;
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
function queryActive(firstLoad) {
  activeStatus = 'querying';
  renderActive();
  fetch(SAVE_API + '?action=query', { method:'GET', mode:'cors', cache:'no-store', signal: AbortSignal.timeout(8000) })
    .then(r => r.json())
    .then(d => {
      if (d.success && d.longitude != null && d.latitude != null) {
        activeLon = parseFloat(d.longitude);
        activeLat = parseFloat(d.latitude);
        activeAcc = d.accuracy || null;
        activeStatus = 'ok'; firstFail = false;
        const rr = d.randomRadius || 0;
        document.getElementById('radiusInput').value = rr;
      } else {
        activeLon = null; activeLat = null; activeAcc = null;
        activeStatus = 'none'; firstFail = false;
      }
      renderActive();
      renderFavs();
    })
    .catch(() => { showQueryFailure(firstLoad); });
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
  const sbtn = document.getElementById('stickySave');
  btn.classList.add('busy'); sbtn.classList.add('busy'); sbtn.disabled = true; sbtn.textContent = t('saving');
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
      sbtn.textContent = t('saved'); sbtn.className = 'btn btn-primary success';
      updateStatus();
      renderActive();
      renderFavs();
      toast(t('saved_toast'));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        btn.textContent = t('save'); btn.className='btn btn-primary'; btn.disabled=false; btn.classList.remove('busy');
        sbtn.textContent = t('save'); sbtn.className='btn btn-primary'; sbtn.classList.remove('busy'); sbtn.disabled=!selected;
      }, 2500);
    } else {
      throw new Error(d.error || t('write_failed'));
    }
  } catch(e) {
    btn.textContent = t('save'); btn.className = 'btn btn-primary'; btn.disabled = false; btn.classList.remove('busy');
    sbtn.textContent = t('save'); sbtn.className = 'btn btn-primary'; sbtn.classList.remove('busy'); sbtn.disabled = !selected;
    // P1b: the banner is the only error surface; toast no longer repeats it.
    showError(true, 'save');
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

// 點座標列即複製（WLoc 收藏一鍵複製的網頁對應物）。文案順序與顯示一致：lon, lat。
function copyCoords() {
  if (!selected) return;
  const s = lon.toFixed(6) + ', ' + lat.toFixed(6);
  const done = ok => toast(ok ? t('copied') : t('copy_failed'), 1500);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(s).then(() => done(true), () => fallback());
  } else fallback();
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta); done(ok);
  }
}
document.getElementById('coords').addEventListener('click', copyCoords);

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
  // 本地捷徑沒有服務端 inRange 把關：兩個數字都 ≤90 時上述啟發式猜不出順序，
  // 与其把可能顛倒/超界的數字搬到地圖上，不如直接請用戶走 /api/parse。
  if (!result || !validCoord(result.lat, result.lon)) {
    toast(t('parse_failed'), 3000); return;
  }
  moveTo(result.lat, result.lon, 15);
  toast(t('parsed', '', result.lon, result.lat));
}

async function searchPlace() {
  const q = document.getElementById('searchInput').value.trim();
  const box = document.getElementById('searchResults');
  box.innerHTML = '';
  if (!q) return toast(t('enter_place'));
  toast(t('searching'));
  try {
    // Worker route /api/search proxies Nominatim through the Cloudflare edge
    // cache (7d). Browser-direct Nominatim hits its rate limits and policy.
    const r = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    const results = sanitizeResults((d && d.results) || []);
    if (!results.length) { toast(t('not_found', q), 3000); return; }
    if (results.length === 1) { chooseResult(results[0]); return; }
    // 多筆結果不再直接取第一筆: 列出可點選的結果, 選了才移動地圖。
    results.forEach(p => {
      const b = document.createElement('button');
      b.className = 'sres'; b.type = 'button';
      b.textContent = (p.name ? p.name + ' — ' : '') + (p.detail || (p.lon.toFixed(6) + ', ' + p.lat.toFixed(6)));
      b.onclick = () => { chooseResult(p); box.innerHTML = ''; };
      box.appendChild(b);
    });
  } catch(e) { toast(t('search_failed'), 3000); }
}
function chooseResult(p) {
  moveTo(p.lat, p.lon, 15);
  toast(String(p.name || p.detail || '').slice(0, 40));
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

// 網址預填: 只在初始載入套用一次(?lat=&lng=)。moveTo 之後使用者任何
// 點選/拖動/搜尋選點都不會再被它覆蓋(這裡不再讀 location.search)。
try {
  const pf = pickPrefill(location.search.slice(1));
  if (pf) moveTo(pf.lat, pf.lon, 15);
} catch(e) {}

applyTheme();
applyI18n();
queryActive(true);
syncSticky();
<\/script>
</body>
</html>`;
}
