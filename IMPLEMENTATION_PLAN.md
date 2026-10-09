# wloc-spoofer 實施計畫

基於 RESEARCH_REPORT.md 與 FEATURE_GAP_ANALYSIS.md，依價值、實作成本、相容性、風險、維護成本排序，制定分階段實作計畫。

## 階段定義
- **P0**：修復現有專案中的明確錯誤、安全漏洞及回歸問題（必須先完成）。
- **P1**：低風險、高價值且符合現有架構的新功能或改善（可在數個工作日內完成）。
- **P2**：需要重大架構調整、原生 iOS/macOS 能力或額外基礎設施的功能（評估後方決策是否投入）。

## 已完成（P0 已上游合併）
- /api/parse SSRF 四件套保護（isFetchable、AbortSignal、readCapped、inRange）。
- 放大鏡/zoom 按鈕位置調整（避免被語言塊覆蓋）。
- 上游同步（百度鏈/港澳台邊界處理、文件在地化）。
- 文件中的過時註釋已更新（如 dist 檔案已入庫）。
- 安全掃描未發現金鑰或 Token 洩漏。

## P0（尚未完成但屬必修項）
| 項目 | 說明 | 參考位置 |
|---|---|---|
| README 中 pages:deploy -c 旗標已於腳本移除，但 README 提示仍指出 `-c` 會報錯（已正確） | 已於腳本移除，README 說明已符合現狀，無需改動。 | package.json、README.md |
| 測試腳本 `test/wloc-stash-output.test.js` 開頭註釋指出 dist/wloc.js 未入庫（已過時） | 更新註釋以符合目前狀態（dist 已入庫） | test/wloc-stash-output.test.js:6 |

## P1（低風險高價值，建議立即實作）
以下功能皆為前端或微小後端改動，實作成本低，且已在功能差距分析表中標記為 **A**。

| 功能 | 實作說明 | 檔案 | 預估工時 |
|---|---|---|---|
| 座標複製按鈕（點選經緯度列即複製） | 新增 `copyCoords()` 函式，使用 `navigator.clipboard.writeText` 並提供 fallback；綁定至 `#coords` 元素的點擊事件。 | src/page.js | 0.5 小時 |
| URL 參數預填 `?lat=&lng=` | 啟動時讀取 `URLSearchParams`，若存在 `lat` 與 `lng` 則直接 `moveTo`；不影響既有行為。 | src/page.js（偵測語言後） | 0.5 小時 |
| 搜尋結果可選（列表點擊） | 修改 `searchPlace`：不僅取 `results[0]`，而是渲染結果列表；點擊列表項目後呼叫 `moveTo`；保留原本自動選第一筆作為預設行為。 | src/page.js（searchPlace 渲染邏輯） | 1.5 小時 |
| 前端座標範圍守門（本地捷徑） | 在 `parseMapUrl` 取得座標後，再檢查 `Number.isFinite`、`Math.abs(lat)<=90`、`Math.abs(lon)<=180`，不符則顯示解析失敗。 | src/page.js（parseMapUrl 後） | 0.5 小時 |
| 高德/Google 地圖層切換顯示（圖層旁說明） | 為現有 `.layer-opt[data-i18n="layer_amap"]` 加上 `data-i18n-title="amap_title"`，使 i18n 系統自動填入說明文字。 | src/page.js（圖層選項 HTML） | 0.2 小時 |
| 憑證管理說明頁鏈結確認 | 確認 README 與 shortcut-guide.md 中指向正確的說明位置（已正確），無需變更。 | docs/shortcut-guide.md、README.md | 0.1 小時 |
| 隧道模式說明補充 | 在說明中增加一段對比：WrapPin 僅做位址互換（非 MITM），WLoc 為真正的 MITM 代理。 | README.md 或 docs/shortcut-guide.md | 0.3 小時 |

**合計預估工時**：約 3.5 小時，可於一個工作內完成。

## P2（需評估，非必須）
| 功能 | 為何列為 P2 | 評估要點 |
|---|---|---|
| 收藏跨設備同步（Cloudflare KV） | 需額外依賴 KV 命名空間、調整讀寫函式、處理配額與錯誤；會帶來成本。 | - 是否真的有跨設備需求？ - KV 讀寫成本（每月免費額度足夠嗎？）- 需要在 wrangler 中新增 KV 並綁定至腳本。 |
| 路線規劃與匯出（GPX/KML） | 需新增 `/api/route` 端點（參考外部服務如 OSRM、Mapbox）或前端使用 Turf.js 演算；或僅提供靜態規劃圖。 | - 是否要依賴第三方服務（會帶來額外費用與限制）？ - 前端效能（大量點）是否可接受？ |
| 真實路線模擬（速度+時間推移） | 需要狀態管理（如使用 Durable Objects 或 KV 計時器），複雜度顯著提升；或改為 Service Worker 背景執行（仍受限於執行時間）。 | - 實際使用頻率？ - 是否可讓使用者自行在裝置端使用 WLoc 代理達成同效？ - 若提供前端模擬，需解決背景執行與電量問題。 |
| 高級診斷（顯示目前網路是否走代理、錯誤日誌下拉） | 需要前端與 Worker 互通（例如經由 `postMessage` 或自訂 API 回報狀態）；屬鍛鍊功能而非核心。 | - 是否真的需要此種診斷？ - 已有錯誤橫幅與重試按鈕，足以處理一般故障。 |

**P2 建議**：先完成 P1，釐清實際使用情境後再決定是否投入 P2。若無明確需求，可維持現狀，專注於穩定性與安全性。

## 里程碑與驗證
0. **P1 實況（2026-10-10 更新）**：上表「座標複製／URL 預填／搜尋可選／範圍守門／圖層說明」已於 `feat/p4-web-ux`（6cbf78a＋5a39dca）完成並通過自動化驗證；守門集中至 `src/coord.js`。憑證/隧道獨立說明頁未做（內容已入 RESEARCH_REPORT.md §4 與 README）。真機閉環待使用者實測。

1. **P1 完成後**：執行完整測試套件 (`npm test`) 確保無回歸；手動驗證每項新功能（座標複製、URL 預填、搜尋列表、範圍守門、圖層說明）。
2. **部署至預備環境**（可使用 `wrangler pages dev` 先行測試），確認無誤後向 `main` 合併。
3. **正式部署**：`npm run deploy`（Worker）以及 `npm run pages:deploy`（Pages），觀測 `wrangler tail` 無異常錯誤。
4. **回溯檢查**：確認金鑰、Token 未意外暴露（重新執行全歷史掃描）。
5. **文件更新**：如有變更，同步更新 RESEARCH_REPORT.md 與 FEATURE_GAP_ANALYSIS.md（若 P2 搬移則調整分類）。

## 停止條件
- 若 P1 任一項目在實作過程中顯示牽連到核心邏輯或需要重大後端變更（例如座標複製需要後端存儲），則停止並重新評估為 P2。
- 若測試失敗且無法在合理時間內修復，則回退該變更並進行錯誤診斷。

--- 
此計畫以實際程式碼為基準，所有時估為粗略參考，實際投入請依當前專案狀況與團體熟練度調整。
