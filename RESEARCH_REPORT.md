# WrapPin 與 WLoc 深度研究報告

本報告整理三個專案的靜態分析結果，供後續功能差距分析與實作計畫參考。

## 1. WrapPin (開發者定位模擬)

- **技術路線**：利用 Apple 開發者 RemotePairing + RSD + DVT LocationSimulation 服務，透過 Rust `idevice` crate 與本機自配對（device‑initiated remote pairing）寫入假座標。實際注入點是 Rust 層 `LocationSimulationClient::set(lat,lon)`，每 200ms（或座標變更≥4秒）重發一次。
- **偽裝隧道**：`WrapPinTunnel` 僅做 L3 位址互換（10.7.0.1 ↔ 10.7.0.2），不攔截或改寫 payload，為 RemotePairing 提供可達點對點鏈路。
- **FFI 介面**：Swift 與 Rust 透過 C ABI（`wrappin_pairing.h`）交換不透明 handle 與結果結構，錯誤以 `WPLocationResult` 傳回，包含可復原標記。
- **狀態持久化**：配對紀錄存 Keychain，座標與偏好存 UserDefaults（收藏、歷史、主題等）。
- **前後台**：靠 `CLLocationManager` 背景定位（kilometer 精度）保持進程存活；無 BGTaskScheduler 實際使用。
- **錯誤處理**：每個 connection_step 有 15s timeout + 可復原標記，失敗時僅重試一次探索。
- **授權**：`LICENSE` 為 PolyForm Noncommercial 1.0.0（**禁止商業使用**），`LICENSE-BETA1-MIT` 僅適用 Beta1 之前的程式碼。
- **已驗證功能**：固定位置、步行/駕車路線（最多 3 條）、速度調整、暫停/繼續、原路返回、換目的地、收藏、歷史、座標系統切換（GCJ‑02/WGS84）、停止時主動恢復真實位置、異常會話恢復、Wi‑Fi/蜂窩診斷引導、深色模式、匿名統計（預設關閉）。
- **限制**：需 iOS 26/27+ 且必須開啟開發者模式；依賴封閉的 RemotePairing/RSD/DVT 協議，未來 iOS 更新可能中斷；隧道版需付費簽名（Packet Tunnel entitlement）；標準版受 SideStore 7 天重簽限制；無 CI／無 UI 自動化測試。

## 2. WLoc (Packet Tunnel Extension + 本地 HTTPS 代理 MITM)

- **技術路線**：
  - iOS：使用 `NEPacketTunnelProvider` 建立隧道（僅路由 10.10.0.1/24，不劫持預設路由），在隧道內劫持 `gs-loc.apple.com` 與 `gs-loc-cn.apple.com` 的 HTTPS CONNECT，以自簽根 CA（有效期 10年）簽發葉證書完成 MITM TLS 握手。
  - 解析請求的 ARPC 二進位協議（version、locale、appID、osVersion、functionID、payload），將其中每個 `WifiDevice` 與 `cellTower` 的經緯度寫入 WGS84 座標（×1e8 整數），重新組裝 protobuf 回應直接返回給 locationd，**不向上游 gs-loc 發請求**（除非構造失敗才 fallback）。
  - macOS：無 Network Extension，改為自動產生 PAC 檔案（`wloc.pac`）將目標域名指向本機 127.0.0.1:19090 代理；透過 privileged helper（SMAppService）執行 `networksetup -setautoproxyurl`，具備雙向簽名驗證（Team ID）以及自毀設計。
- **座標系統**：內建 WGS84↔GCJ‑02↔BD‑09 雙向轉換（標準 Krasovsky 橢圓 + 迭代反算 4 次），港澳台與境外走 Apple/Google 直接 WGS84，中國大陸走 GCJ‑02 偏移。
- **狀態持久化**：全部使用 UserDefaults（App Group `group.com.wlocapp.shared`）存儲鎖定點、收藏、代理身份密碼等；無 Keychain、無資料庫。
- **收藏／歷史**：iOS 與 macOS 均有收藏 UI；macOS 具備「快速還原」功能（停止代理並還原系統代理設定），iOS 僅提示使用者手動關閉 VPN。
- **深度連結**：支援 `wlocapp://` 傳入 JSON（經緯度、標籤等），自動選點並鎖定。
- **外部依賴**：僅呼叫 `api.opentopodata.org/v1/aster30m` 取海拔、`api.github.com/repos/OpenHRTT/wloc/releases/latest` 做更新檢查；其餘皆為本地服務或 MapKit/CLGeocoder。
- **授權**：標準 MIT（可商用），但 `NOTICE` 說明僅適用於本專案原始程式碼，第三方依賴需另行檢授權（實際缺少 `THIRD_PARTY_NOTICES.md`）。
- **README 過時聲明**：預設 .p12 密碼為「app-wloc」實際為「1」；iOS27 beta6 被封堵說法為伺服器端行為變更（倉庫內無對應程式碼）。
- **已驗證功能**：鎖定位置（固定或隨機擾動）、收藏、歷史、深度連結、海拔查詢、自訂經緯度輸入、更新檢查（macOS）、跳轉至系統設定（信任憑證、Network Extension）、錯誤日誌（App Group 內 hex+base64）。
- **限制/風險**：
  - 需使用者手動安裝並完全信任根憑證（iOS 不允許 App 自動信任），對 certificate pinning 的 App 無效。
  - 只有走 Wi‑Fi／基站網路定位的定位會被影響；GPS 訊號強時系統可能優先衛星定位，實際效果「待驗證」。
  - 默認 p12 密碼寫死在 bundle 中，金鑰與密碼同儲存在 App Group，缺少 Keychain 保護，到期無自動檢查。
  - 更新檢查僅 macOS 有；iOS 無自動更新機制。
  - 無「模組」下載機制（wloc8.com 線上版功能未開源）。

## 3. wloc-spoofer（Cloudflare Workers + 前端選點頁）

- **定位**：Cloudflare Workers（Hono）提供 `/api/parse`（解析地圖連結、座標轉換、SSRF 防護）與 `/api/search`（OpenStreetMap Nominatim 代理 + 7 天 Edge Cache）。前端頁面（純 JS + Leaflet）負責地圖選點、座標顯示、收藏（localStorage）、主題/語言切換、錯誤橫幅與重試、圖層切換（WGS84、衛星、高德、標準、暗色等）、貼上連結解析、目前生效座標顯示。
- **核心防護**：
  - `/api/parse` 使用 `isFetchable`（只允許 http/https）、`safeFetch`（AbortSignal 8s + 逐 hop 檢查）、`readCapped`（512KB 硬上限）、出口再 `inRange`（合法緯度/經度範圍）。
  - `/api/search` 使用 `caches.default` 與固定 User-Agent，待寫回非阻塞。
- **狀態**：`localStorage` 三鍵：`theme`（auto|light|dark）、`wloc_lang`（zh‑Hant/en）、`wloc_favorites`（座標+備註+時間戳）。
- **已驗證功能**：搜尋、經緯度/地圖連結解析、座標系統自動偵測（高德/Apple Maps 為 GCJ‑02、百度為 BD‑09）、座標四捨六位、錯誤橫幅+重試、手機 sticky bar、主題切換、國際化（中英）、收藏（本地持久化）、貼上連結、目前座標顯示、隨機擾動半徑（0 表示關閉）。
- **缺失（相較於 WLoc 原生功能）**：無代理/憑證管理（因為是純網頁）、無路線模擬（步行/駕車），無收藏的雲端同步或跨設備持久化，無深度連結匯入、無座標複製按鈕、無 URL 參數預填（?lat=&lng=）、無前端座驗範圍守門（本地捷徑只靠經緯度啟發式）。
- **授權**：AGPL-3.0（必須衍生作品亦以同條款開源）。
- **部署**：標準 Workers 服務與 Pages 頁面皆指向同一份程式碼；`wrangler.jsonc` 與 `wrangler.pages.jsonc` 保持同步的 `compatibility_date`；觀測到 `pages:dev` 與 `pages:deploy` 中的 `-c` 旗標在新版 wrangler 會報錯，已改為不使用自訂配置檔（依賴根目錄的 `wrangler.pages.jsonc` 自動載入）。
- **安全掃描**：全歷史無 API 金鑰、Token 或私鑰洩漏；dist 檔案無高熵字串；SSRF 四件套、SRI、錯誤橫幅、CORS `*`（功能需求）均已就位。

---

## 4. 代理工具、MITM、通道與系統定位的責任邊界（Shadowrocket 架構審查結論）

### 4.1 Shadowrocket 等代理工具如何處理網路請求

App 發出的請求先經系統代理（或小火箭內建的透明路由）：HTTP 請求可直接看到完整內容；HTTPS 請求在代理端呈現為 `CONNECT 網域:443`，內容被 TLS 加密包裹。只有當請求的**網域名稱符合 `[MITM] hostname` 名單**、且工具用受信任的 root CA 現場簽發該網域的葉證書、且**裝置已完全信任這張 CA** 時，工具才解密得到明文，並依規則把回應交給 `http-response` 腳本處理。名單外的網域原樣直通，腳本看不到任何內容。

### 4.2 四種機制的區別（不可混為一談）

| 機制 | 實際修改的資料 | 系統前提 | 做不到什麼 |
|---|---|---|---|
| **本專案模組**（wloc.js） | Apple 網路定位伺服器 `gs-loc(.cn).apple.com/clls/wloc` **HTTPS 回應**中的 protobuf 座標欄位（`Math.round(1e8*lat/lon)` 直接覆寫，證據：dist/wloc.js field1/2/3 替換段） | 代理開通＋模組啟用＋既有 CA 信任＋MITM 名單含 gs-loc | 改不到純 GPS（衛星訊號不走 gs-loc）；改不到未列入名單的網域 |
| **HTTPS MITM／受信任憑證** | 上述修改的**必要條件**，不是獨立功能 | 憑證已匯入且「完全信任」；App 若做 certificate pinning 或走 QUIC 則仍攔不到 | 「安裝憑證」≠ 能攔截所有系統程序的 HTTPS |
| **VPN／代理通道** | 只決定流量經過誰 | 小火箭的代理模式即足夠，本專案不需要 NE tunnel | 通道本身不改任何資料 |
| **iOS 系統定位模擬**（WrapPin 路線） | 直接命令 `locationd` 輸出假位置（CoreDevice RemotePairing→RSD→DVT LocationSimulation） | 開發者模式＋配對＋每 200ms 續發 | 與網路、憑證、代理完全無關；本專案**未實作**此路線 |

### 4.3 已實作並驗證 vs 尚未驗證

**已驗證（自動化證據：npm test 33/33＋Chromium 真瀏覽器斷言 37/37，腳本 scripts/acceptance_browser.py）**：選點頁地圖/搜尋/收藏/主題/語言、共用座標守門（非法值不設 selected）、多筆搜尋結果可選、?lat&lng 初始預填、座標複製、地圖連結解析（/api/parse）、SSRF 防護。

**尚未驗證（無真機證據，不得宣稱）**：
- 真機「儲存到裝置」→ `wloc-settings.js` 寫入 `$persistentStore` → `wloc.js` 讀取生效的完整閉環。測試前提：iPhone＋小火箭代理開＋模組啟用＋CA 已完全信任＋選點頁流量與 locationd 流量走同一代理。
- 修改後定位在各 App（Apple 地圖/微信/打卡類）實際顯示的差異——取決於各 App 用網路定位還是 GPS、以及融合權重。
- iOS 26+ 定位快取與 iOS 27 beta 起對 gs-loc MITM 的 TLS 拒收（README 記載的作者在 beta 8 實測），**本環境無法重現，屬上游宣稱**。

### 4.4 參考專案授權限制（引用概念前必讀）

- **WrapPin**：PolyForm Noncommercial 1.0.0——**禁止商業使用**；僅可借鑑「開發者定位模擬」的公開協議知識，不得複製其原始碼進本專案（本專案為 AGPL-3.0，兩者條款亦不相容混併）。
- **WLoc（OpenHRTT）**：MIT，可商用；但 README 內部分宣稱（海拔 API、更新檢查）在開源碼中無對應實作，屬線上版功能，引用時以開源碼為準。
- 本專案 wloc-spoofer：AGPL-3.0（衍生物須同條款开源）。

---

> 以上結論均來自靜態程式碼分析與本環境自動化測試（單元 33 項＋無頭瀏覽器 37 斷言），未執行任何真機測試。所有主張均附上檔案路徑、函式名稱或提交號，無法驗證之處標記為「待驗證」。
