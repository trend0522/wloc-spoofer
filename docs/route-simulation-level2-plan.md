# 層級 2：iOS 系統定位沿路模擬 — 可行性分析與實作計畫（P7）

日期：2026-10-11。分析基點：本專案 `e243b6b`（＝遠端 HEAD，工作樹乾淨，Workers Builds success，線上已部署）。
**本文件只是分析與計畫。未修改 dist/、modules/ 或任何正式定位行為；未推送任何行為變更。**

---

## 1. 現況與原始碼證據

### 1.1 定位模組的事件模型（被動應答，無排程器）

`modules/wloc.module`（本專案，與上游 ios151/wloc `ee38b09` 同構）：

```
Apple WLOC = type=http-response, pattern=^https?://(gs-loc(-cn)?\.apple\.com|gsp-ssl\.ls\.apple\.com|bluedot\.is\.autonavi\.com…)/clls/wloc,
             requires-body=1, binary-body-mode=1,
             script-path=…/dist/wloc.js,
             argument=longitude=113.94114&latitude=22.544577&accuracy=25&randomRadius=0&logLevel=info
WLOC Settings = type=http-request, pattern=^https?://gs-loc(-cn)?\.apple\.com/wloc-settings/save,
             script-path=…/dist/wloc-settings.js
```

- 兩條規則都是**攔截式腳本**：只在對應 HTTP 請求發生時執行。代理平台（Surge/Loon/Stash/Shadowrocket/Egern/QX）不給這類腳本任何定時回調能力 → **不存在「依時鐘主動推進位置」的通道**。
- `dist/wloc.js` 內 `Date.now` 僅出現 2 處，全部在 console 計時器（`time/timeLog`）內，**定位管線零時間邏輯**（逐字元 grep 實證）。

### 1.2 每單次請求的配置解析鏈（`Ze()`，dist/wloc.js 實讀）

優先序：`wloc_settings`（持久化）> `$argument`（模組參數）> `De` 出廠預設：

```js
const De = {longitude:null, latitude:null, accuracy:25, randomRadius:0, logLevel:"info"};
// Ze(): 讀 $argument → 逐欄 parseFloat/parseInt →
// 讀 getItem("wloc_settings")（adapter 自動 JSON 解析，物件形）→ 覆蓋
// 若持久化為空 且 參數 === 113.94114/22.544577 → 透傳（座標歸 null，不改定位）
// 若 longitude/latitude 為 null → 透傳
```

套用點（patch 前）：`if (null==r.longitude||null==r.latitude) return 透傳` → 否則以**單一固定點** ± jitter（`randomRadius`，球面隨機）覆寫 protobuf 回應座標，日誌 `[wloc] 目標座標: …`。

### 1.3 寫入端（`dist/wloc-settings.js`）

- `const n="wloc_settings"`；解析 URL query（`lon/lat/acc/randomRadius`、`action=query|clear`）。
- 成功寫入的物件形如 `{longitude, latitude, accuracy, randomRadius, logLevel}`（五欄，`test/wloc-stash-output.test.js` 的 vm 契約直接斷言 top-level 欄位）。
- **無任何多點/路徑/時間欄位。**
- 跨平台 storage adapter：Surge/Loon/Stash/Egern/Shadowrocket → `$persistentStore.write(value, key)`；QX → `$prefs.setValueForKey`；Worker/Node → 記憶體 shim。持久化的值是**序列化的 JSON 字串**，讀回自動 parse（`typeof e=="object"` 分支實證）。

### 1.4 網頁端現況（src/page.js）

層級 1 已上線：`routeData = {coords, cum, total, provider, mode, distance_m, duration_s}`（WGS84），動畫以 `requestAnimationFrame` 依 `simDist += dt × baseSpeed × mult` 推進——**純瀏覽器時鐘，與裝置端完全無關**。裝置寫入只有一條既有通路：`SAVE_API?lon=&lat=&acc=25&randomRadius=`（單點）。

### 1.5 上游/兄弟專案參考 commit

| repo | commit | 相關證據 |
|---|---|---|
| ios151/wloc（dist 產物源頭） | `ee38b090cf620be6fe99c88052fd3a2dc207b2e2` | README 工作原理同 §1.2/1.3；**無模組源碼**，僅 minified dist（改寫須自製源＋build） |
| trend0522/cyberhandyman-ioslocspo（上游Yu9191/wloc 系譜） | `c84cb4327400e75012dc71482cec4045bce20956` | 同套 persistentStore 讀寫模式（`location-spoofer.js:937-1058`），其 `Date.now()` 僅用於 geocode cache TTL（1261 行）——同樣無時間推進 |

## 2. 缺口分析：層級 1 → 層級 2 缺哪些介面

1. **資料契約缺口**：持久化只有 5 欄單點；無 `shape/cum/t0/speed/mult/state` 任何路徑或時間概念。
2. **解析缺口**：`Ze()` 沒有「依時間算當前點」的步驟；patch 只用單點。
3. **推進模型缺口**：無排程器 → 只能改成**事件式推進**：每次 `/clls/wloc` 請求到達時，用腳本內 `Date.now()` 計算 `elapsed = now − t0 − pausedMs`，`dist = elapsed × speed × mult`，沿 route 插值取點。（可行性取決於 §6 的請求節律，這是模型的本質限制，非實作缺陷。）
4. **控制缺口**：暫停/繼續/重設需要 t0 修正（把暫停時長累进 pausedMs）與清除通路。
5. **UI 缺口**：page.js 沒有把已規劃的 `routeData` 序列化寫入裝置的按鈕（現在只能寫單點）。

## 3. 建議架構與資料契約

### 3.1 新持久化 key：`wloc_route`（不動 `wloc_settings`）

選**新 key** 而非擴充舊 key 的理由：舊腳本（使用者尚未更新 dist 時）讀 `wloc_settings` 不會看到垃圾欄位；單點行為與路線行為可独立清除；回滾面最小。

```json
{
  "v": 1,
  "mode": "walking",
  "provider": "valhalla",
  "shape": "<polyline6, 降採樣後>",
  "speed": 1.4,
  "mult": 1.0,
  "t0": 1791712345678,
  "pausedMs": 0,
  "pauseStart": null,
  "totalM": 6077.4,
  "endsAt": 1791716700000
}
```

- `shape`：座標（WGS84）經**點數上限降採樣**（建議 ≤800 點、序列化後 ≤3KB，見 §5 容量）。
- `cum` 不入档：讀端就地重算（O(n) haversine，n≤800 微秒級）。
- 有效位置：`pos = interpolate(shape, clamp((now − t0 − pausedMs − (pauseStart? now−pauseStart:0)) / 1000 × speed × mult, 0, totalM))`。
- **終點語意**：`dist ≥ totalM` → 抵達。策略（可選，預設 a）：a) 自動清除 `wloc_route`，回落到 `wloc_settings` 單點（終點即選點時兩行為一致）；b) 停在終點直到手動清除。

### 3.2 settings 端新 `action`（純增量，不觸碰既有 query/clear/save 路徑）

```
GET …/wloc-settings/save?action=route-set&shape=<p6>&speed=1.4&mult=1&t0=<ms>&mode=walking&provider=valhalla&totalM=…
GET …/wloc-settings/save?action=route-pause          → pausedMs += now − pauseStart; pauseStart=now
GET …/wloc-settings/save?action=route-resume         → pauseStart=null
GET …/wloc-settings/save?action=route-status         → {success, active, distM, posLat, posLon, endsAt, paused}
GET …/wloc-settings/save?action=route-clear          → 刪除 wloc_route（wloc_settings 不受影響）
```

輸入驗證（信任邊界，全部必做）：polyline6 字元集白名單、解碼後點數/距離上限、`speed∈(0,80] m/s`、`mult∈(0,10]`、`t0` 合理範圍（±1 年）、JSON 序列化長度上限；任何不合格 → 拒絕寫入並回 `{success:false,error:…}`（新 error 值只作顯示，沿用 page 只認 `success` 布林的事實）。

### 3.3 讀端改動（wloc.js）

`Ze()` 之後、jitter 之前插入一段（獨立 function，不動現有 merge/透傳代碼）：

1. 讀 `getItem("wloc_route")`，無/壞/v 不符 → 直接走現行單點路徑（**預設退路＝零行為變化**）。
2. 有 → 依 §3.1 公式算 `(lat,lon)` 覆寫 r.longitude/r.latitude；jitter 照常套用（`randomRadius` 语义在路線模式下變成「沿點擾動」，保持契約）。
3. 日誌新增 `[wloc] 路線模擬 dist=…m`（顯示用字串，遵守繁中化慣例）。
4. 任何例外 → try/catch 回落單點（上層已有 catch 回傳原 body，繼承）。

### 3.4 網頁端

路線卡新增「啟動模擬到裝置」：把 `routeData`（已含 coords/cum/total/mode/baseSpeed/mult）降採樣、polyline6 編碼、帶 `t0=Date.now()` 打 `route-set`；播放/暫停/重設鈕在**裝置模式**下改打 route-pause/resume/clear（UI 需顯示目前處於「網頁預覽」或「裝置模擬」，兩者不可混同）。

## 4. 必須修改的檔案與原因

| 檔案 | 改動 | 原因 |
|---|---|---|
| `dist/wloc.js` | §3.3 讀端插段 | 唯一讀配置、patch protobuf 之處 |
| `dist/wloc-settings.js` | §3.2 新 actions＋驗證 | 寫入端與狀態查詢端 |
| `src/page.js` | 裝置模擬按鈕＋模式顯示＋route-status 輪詢 | 產生/控制路線資料的使用者介面 |
| `test/wloc-stash-output.test.js`（或新 `test/route-sim.test.mjs`） | §7 案例 | 行為級證據 |
| **新增** `src/wloc-route-core.js`（或上游 `worker/` 旁的未 minify 模組源＋build 腳本） | 共享插值/解碼核心 | 見 §4.1 |
| **零改動** | `modules/*`（含 argument 深圳預設）、`src/index.js`、`src/parse.js`、`src/gcj-browser.js`、`wloc_settings` 既有五欄契約、透傳判定 | 紅線；route 寫入複用同一條已被 MITM 攔截的 save URL，模組規則不用加 |

### 4.1 上游分叉成本（重要）

上游 `ios151/wloc` 只發布 minified dist（無源碼）。**直接改 minified 檔 = 永久分叉**：每次上游 sync 都要重放（同繁中化 pass 的處理，但這次是邏輯級、風險更高）。兩條路：

- **A（建議）**：自有未 minify 模組源（`modules-src/wloc.js`、`modules-src/wloc-settings.js`）＋ esbuild `--minify` 產 dist/，上游 sync 改成「diff 上游 dist vs 我方 build 產物」而非手動覆寫；源頭最終可提 PR 給 ios151。
- **B（快但債重）**：在 minified 檔上做 surgical patch，commit 註記重放程序。僅適合先驗證可行性。

## 5. 相容性、效能、安全風險

- **事件節律＝模型天花板**：位置只在 Apple 發 `/clls/wloc` 時更新。 Maps 導航期間實測節律約數秒～數十秒一請求（**需實機量化，見 §8**）；間隔長時，插值算出的就是「那一刻該在的位置」，视觉上呈跳點而非平滑——這是**正確行為**（時間推進），非 bug。若 app 完全不再請求（退後台），位置就凍結在最後請求的推算值——**不得宣稱後台連續移動**。
- **僅網路定位**：gs-loc 是 Apple 的 WiFi/基地台定位通道；純 GPS 場景（無網路定位）不受影響＝不移動。本專案既有定位行爲的固有邊界，照實標註。
- **存儲容量**：QX `$prefs` 與各平台 persistentStore 對值長度有上限（各平台確切數字需實機驗證；保守設計：shape ≤800 點、序列化 ≤3KB、寫入端硬拒 >4KB）。長距離路線靠降採樣壓縮（200km 路線 800 點 ≈ 每 250m 一點，插值誤差 ≪ 都市定位精度，可接受並如實宣示「降採樣」）。
- **效能**：每請求 decode+cum 重算 O(n≤800)、插值 O(n) 線性（或 binary search）→ 亚毫秒級；遠低於腳本 30s timeout。記憶體无累積（每請求重讀）。
- **時鐘**：t0 用裝置本地時間——使用者改時鐘會平移路線（行爲可預期）；t0 未來/久遠由 clamp 處理（0..totalM 內）。跨終點自動清除，不留殭屍狀態。
- **壞資料回滾**：無 key→原行為；JSON 損壞→try 落回單點；`v` 不符→忽略。保證「新讀端 × 舊寫端」與「舊讀端 × 新寫端」兩向都不炸（舊讀端根本不認 `wloc_route`，零副作用）。
- **安全**：路線資料經 MITM 攔截的 fake URL query 傳遞（與現有 lon/lat 同通道同信任模型，不新增暴露面）；不引入新網路請求；polyline 字元集白名單擋注入；本機無新祕密。
- **回滾方案**：`action=route-clear`（運行時）→ git revert dist commit（Workers Builds 自動重新部署 page；代理工具的 dist 由 raw.githubusercontent 取得，revert 即回到舊腳本，使用者端無需任何操作，下次腳本快取過期自動生效）。

## 6. 為什麼這仍可行（核心判斷）

不需要排程器、不需要新規則、不需要改 modules/：
推進所需的全部原料——**路徑（polyline）＋時間差（Date.now − t0）＋速度**——在「每次被動應答的瞬間」都可得。單點契約升級成「時間參數化曲線」，事件式讀取天然就是 lazy 的。改動被壓縮在兩支 dist 腳本各自的局部函式＋page.js 按鈕，`wloc_settings` 舊契約原封不動。

## 7. 測試案例與成功條件（可自動化的部分）

vm 級（`node --test`，擴大既有 `test/wloc-stash-output.test.js` 手法；vm context 內注入可控 `Date`）：

| # | 案例 | 成功條件 |
|---|---|---|
| 1 | 無 `wloc_route` | 行為與現行逐位元組同（單點/jitter/透傳測試全綠） |
| 2 | 直線 shape、t0 固定，now=t0 | patch 點＝起點 |
| 3 | now=t0+total/speed/2 | 點在中點（誤差 <1e-6°） |
| 4 | now>終點 | clamp＝終點，且回應後 key 已清除（策略 a）|
| 5 | pause 30s 再 resume | 進度滯後 30s×speed |
| 6 | 壞 JSON / 錯 v / 超長 shape / 非法 speed | 全部落回單點，不 throw |
| 7 | settings route-set 驗證器 | 非法輸入 100% 拒寫、合法寫入後 route-status 讀回一致 |
| 8 | 降採樣器 | ≤800 點、≤3KB、端點保真（首末點不動）、最大偏離 <50m |
| 9 | QX/Stash 雙 shape 回應契約 | 既有 top-level response 欄位測試不回歸 |
| 10 | 回滾 | route-clear 後同请求序列恢復單點行為 |

回紅：`npm test` 現 29 項目必須全綠才算達成。

## 8. 必須真機驗證（不可自動化）

1. 各代理平台（Surge/Loon/Stash/Shadowrocket/Egern/QX）`/clls/wloc` 在 Maps 導航中的**實際請求節律**（决定跳點粒度）。
2. `randomRadius` 與路線點疊加的實機語意（沿點擾動是否符合期待）。
3. 平台 persistentStore 值長度上限實測（3KB 假設的邊界）。
4. 後台/鎖屏時的行為（預期＝凍結推算點，需確認無 crash）。
5. Apple 快取（app 端定位快取可能使顯示滞后一個週期）。

## 9. 分階段實作順序

1. **P8-a**：寫 `modules-src/`（由上游 dist 反推＋自有可讀源）＋esbuild 產 dist 的 build/比對腳本——先證明「重建產物 ≒ 現行 dist」，這是之後一切修改的安全網。
2. **P8-b**：settings 端 route actions＋驗證器（新 key，不動舊路徑）＋vm 測試 #7、#8。
3. **P8-c**：wloc.js 讀端插段＋測試 #1–6、#10（此階段 dist 改動僅在分支，不合 main）。
4. **P8-d**：page.js 裝置模擬 UI（預覽/裝置雙模式標示）。
5. **P8-e**：真機矩陣（iPhone + Stash 優先，其次 Surge）跑 §8 清單 → 全綠才合併、推送、走 Workers Builds＋raw 重新部署 dist。
6. 任一階段不過 → 分支即丟，main 零污染。

## 10. 可行性結論

**可行，但有一個不可迴避的語意修正**：層級 2 的「沿路移動」在本架構只能是**事件式時間插值**——iOS 系統定位會沿路線推進，但推進的**可見粒度取決於 app 觸發 gs-loc 的節律**，且純 GPS 場景與後台長眠場景不受控。這不是實作偷工，是被動 HTTP 攔截模型的定义域。Web 動畫（層級 1）≠ 裝置定位（層級 2），兩者在 UI 與宣稱上必須永遠分開。

**阻塞點（實作前需要決策/資源，非分析缺口）**：
1. §4.1 分叉路線 A/B 取決（建議 A）。
2. 真機與多平台節律數據需要一台 iPhone＋代理 app 實測窗口（§8），我無法在本機產生。
3. 終點策略 a/b 拍板（預設 a）。
4. 若走 A，需一個可跑 esbuild 的固定 build 流程入 repo（新增 devDependency，一次性）。

本階段未改任何 dist/modules/定位行為，未推送；層級 2 **未完成**，僅完成可行性與計畫。
