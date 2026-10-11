# 地圖 Key 與路線模擬 — 研究與設計（P1）

日期：2026-10-11。本文件記錄三個專案的實際檢查 commit、授權結論、可重用設計，以及功能 A（自訂地圖 API Key）與功能 B（三種路線模式）的設計決策。

## 一、實際檢查的專案與 commit

| 專案 | commit | 性質 | LICENSE | 對本專案的可重用性 |
|---|---|---|---|---|
| trend0522/wloc-spoofer（主專案） | `4138ed9ccd0f8bc10ab691e739de456c12bf452f` | Cloudflare Worker（Hono）＋選點頁＋上游 dist 模組 | **AGPL-3.0**（本專案自身） | 基準架構：page.js 模板字串、SAVE_API 契約、wloc_settings 持久化 |
| suversal/WrapPin | `7aea1aee0cfbe57ed9b6abb99796f2024a1f15a1` | iOS App（SwiftUI＋MapKit），Roam Control 衍生 | **PolyForm Noncommercial 1.0.0** | ⚠️ 非商業授權 → **不可複製程式碼**；只採其「概念」（見下） |
| OpenHRTT/wloc | `b751112880c87d4a18cf2b693d077042ee261a7b` | iOS/macOS 原生 App（MapKit、MIT，第三方元件另計） | **MIT**（專案自有碼） | 授權相容（MIT→AGPL 可行）；但它是原生 App，無瀏覽器/Worker 程式碼可搬 |

### 檢查到的關鍵實作

**WrapPin**（僅概念參考）：
- `Features/Map/WalkingRoutePlanner.swift`：`MKDirections` 封裝，`RouteMode{walking,driving}` → transportType 對映、錯誤時「無該模式路線」降級提示。
- `Features/Map/WalkingSimulationController.swift`：狀態機 `idle/preparing/walking/paused/arrived/stopping`；`progress = distanceTravelled/totalDistance`、`cumulativeDistances`、依 `speedMetresPerSecond` 計算 `movementTarget`。**這正是功能 B 動畫層要抄的模型（數學概念，非程式碼）**。
- 其模擬走 CoreLocation 私有 API（設備本地），與本專案的 MITM 回應替換是兩條完全不同的路；它的「沿路移動」無法移植到我們的架構層 2（見功能 B 節）。

**OpenHRTT/wloc**：
- `WLocMapViewController.swift` 只有選點/搜尋（MKMapItem search），**無路線規劃、無沿路模擬** → 對功能 B 沒有實作可重用。
- 價值在 `docs/ARCHITECTURE.md`（gs-loc protobuf 替換契約文件）與座標系處理慣例，與我們 `src/parse.js` 的 GCJ/BD09 邏輯互相印證。

**wloc-spoofer 本身**：
- `dist/wloc.js`（上游 ios151 minified）：每次 `gs-loc.*/clls/wloc` 請求 → 讀 `$persistentStore.read('wloc_settings')` 的**單一目標點** → 覆寫 protobuf 回應座標（±jitter）。**沒有時間軸、沒有路徑概念。**
- `src/page.js`：全部 UI 都在一個模板字串內；已有 localStorage 慣例（`wloc_favorites`/`wloc_lang`/`theme`）；圖層註冊表 `tiles{...}`＋`layerIsGcj` 標記；GCJ 換算以 `GCJ_BROWSER_JS` 字串注入（規避 wrangler minify 的 `toString()` 問題）。
- `src/index.js`：僅 `/`、`/api/parse`、`/api/search` 三條路由；**無 KV/secret 綁定、無 CLOUDFLARE_API_TOKEN 於本機**。

## 二、授權與風險評估

- WrapPin 的 PolyForm Noncommercial 禁止商業用途。本專案模組供公開使用、README 有商業化上游引用 → **保守判定：一行都不複製**，僅重述其狀態機/進度數學為自有實作。MIT 的 OpenHRTT 部分理論可搬，但無可搬之物（無瀏覽器碼）。
- 主專案 AGPL-3.0：新增原始碼以同授權寫入同 repo，合規（本來就是公開 AGPL repo）。
- 功能 A 引入的都是「使用者自带 key」的前端直連呼叫，不涉及第三方碼的重 distributen。

## 三、功能 A 設計 — 網頁自訂地圖 API Key

原則：**不重寫既有地圖**。現有 6 個免 Key 圖層原樣保留為預設退路；Key 版供應商是「加掛」的動態圖層。

1. 設定介面：圖層選單底部加「自訂圖磚（進階）」區 — 供應商（Mapbox / MapTiler）、底圖樣式（各供應商 2–3 個內建樣式）、公開 Token 輸入框。
2. 供應商能力（皆公認的瀏覽器公開 key 模式）：
   - **Mapbox**：`pk.` 開頭公開 token；圖磚 `api.mapbox.com/styles/v1/<style>/tiles/512/{z}/{x}/{y}?access_token=`；官方支援瀏覽器直連（CORS）。
   - **MapTiler**：public key；圖磚 `api.maptiler.com/maps/<style>/{z}/{x}/{y}{r}.png?key=`；同樣瀏覽器直連。
3. 測試按鈕：以 `new Image()` 載入中心點 z=12 圖磚，onload=通、onerror=敗 — 不發任何寫入型請求。
4. 持久化：localStorage `wloc_map_cfg`（provider/style/tileKey/routeKey），重載後自動還原並重建圖層。**key 只存本機瀏覽器**。
5. 安全紅線（頁面明示）：只填**公開 token**（Mapbox pk. / MapTiler public key），絕不填 secret（sk./私鑰）；公開 token 暴露於本裝置瀏覽器，費用與配額風險由 token 持有者帳務承擔，建議設 URL 限制與用量上限；本站 Worker 不經手、不上傳、不記錄任何 key（圖磚與路線都是瀏覽器→供應商直連）。
6. 地圖 key 與路線 key 分開欄位（供應商不同組合時各用各的）。

## 四、功能 B 設計 — 步行/腳踏車/開車路線

### 服務介面（統一資料模型 + 可替換 provider）

`route-core`（字串注入檔 `src/route-core.js`，導出 `ROUTE_CORE_JS`；瀏覽器與 node 測試共用**同一份實作**，吸取 gcj-browser.js 教訓並消除鏡像漂移）：

```
fetchRoute({provider, mode, from:{lat,lon}, to:{lat,lon}, key})
  -> { coords:[{lat,lon}…], distance_m, duration_s, provider, mode }
```

- **預設（免 Key）：FOSSGIS Valhalla**（`valhalla1.openstreetmap.de/route`，OSM 社群公共服務，CORS 開放）— costing 對映 `walking→pedestrian`、`biking→bicycle`、`driving→auto`。三种模式全部**真實支援**（不換標籤）。
- **Mapbox Directions**（用功能 A 的路線 key）：`mapbox/{walking|cycling|driving}`。
- **MapTiler Directions**（OSRM 系，key 同 MapTiler）：`foot|bike|car`。
- Polyline（Valhalla/GraphHopper 的 polyline6）用自寫 20 行解碼器 → 統一 GeoJSON-ish coords。
- 注意：公共 Valhalla 有公平使用政策，頁面註明「量大請自備 provider」。

### 層級 1：網頁路線預覽（本輪實作範圍）

- 起點＝目前選點（或手動/搜尋/定位）、終點＝搜尋選點。
- 三種模式按鈕、距離與預估時間顯示、可調速度（各模式預設 1.4 / 5.0 / 13.0 m/s，滑桿 0.5×–3×）。
- `L.polyline` 繪製全路線；動畫 marker 依 `progress`（WrapPin 概念的自有實作：cumulative 距離表 + `positionAt(d)`）前進；開始／暫停／繼續／停止／重設。
- 「写入当前位置到裝置」按鈕：把動畫當前點呼叫既有 `SAVE_API`（僅一次、走現有契約）。
- **明確宣稱：這只是網頁預覽；iOS 系統定位不會自己沿路移動。**

### 層級 2：實際定位模擬 — 研究結論（本輪不可達成，不假稱完成）

資料流現況：頁面 →（MITM 攔截）`gs-loc.apple.com/wloc-settings/save` query → `dist/wloc-settings.js` 寫 `$persistentStore('wloc_settings')` → 之後每次 `clls/wloc` 請求由 `dist/wloc.js` 讀**靜態單點**＋jitter 覆寫 protobuf。

技術限制：
1. `wloc_settings` 只有 `{longitude,latitude,accuracy,randomRadius,logLevel}` 五個欄位（vm 測試 `test/wloc-stash-output.test.js` 即此契約），無路徑/速度/起點時間。
2. Apple 端 `clls/wloc` 的請求節奏與时机不受我們控制，且腳本只能被動應答。
3. `dist/wloc.js` 是上游 minified 產物——任何改寫都屬「自訂分叉」，上游每次 sync 都要重放，且繁中化 pass 之外再加一層維護成本。

可行方案（需修改的模組清單，供日後拍板）：
- **必改**：`dist/wloc.js`（或改由自有未 minify 模組源＋build 管線，如上游 ios151/wloc 的 `worker/`）：新增讀 `wloc_route`（polyline6＋速度＋t0）→ 每回應依 `(now-t0)*v` 沿 cumulative 距離插值取代單點；終點後回退單點模式。
- **必改**：`dist/wloc-settings.js`：save/query/clear 增加 `route=` 參數與 route 欄位存取（新 key `wloc_route`，不動 `wloc_settings`）。
- **必改**：`src/page.js`：加「啟動路線模擬到裝置」按鈕（序列化 coords→polyline6、帶速度與起始 epoch）走 SAVE_API。
- 測試門檻：擴充 `test/wloc-stash-output.test.js` 的 vm 情境（固定 `$script.startTime`、注入 route、斷言不同時間的插值座標落在 shape 上）。
- 實機門檻：iOS 快捷指令／Surge/Stash 環境驗證 `gs-loc` 週期與地圖 App 實際顯示移動 — **這一段無法在本機驗證**，完成後仍須標「待實機驗證」。

## 五、回归红线（實作必須遵守）

- 零觸及：`modules/*`（含 argument 預設深圳值）、`dist/wloc.js`、`dist/wloc-settings.js`、`/api/parse`、`/api/search` 契約、透傳模式判定、`wloc_settings` key、定位演算法。
- 每次修改：`node --check src/page.js` ＋ 渲染後 inline script `node --check` ＋ `npm test` 全綠才可提交。
- 繁中化為頁面既定語言慣例：新 UI 文案一律 zh-Hant＋en 雙表。
