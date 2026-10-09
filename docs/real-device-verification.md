# 真機驗收紀錄：wloc-spoofer × iPhone × Shadowrocket（佔位報告，待真機回填）

基準：`feat/p4-web-ux@cb96d02`（本地）；真機模組與腳本實際來源為
`raw.githubusercontent.com/trend0522/wloc-spoofer/refs/heads/main/`（= `dc1e773`）。
實測三檔（`dist/wloc.js` 0aada8a1…、`dist/wloc-settings.js` b5033e98…、
`modules/wloc.module` 1cb8358e…）遠端與本地 main **逐位元組一致**（md5 核對 2026-10-10）。
正式站目前仍部署舊版 worker（P0 前端修復未部署），**不影響本紀錄所驗證的 save 流程**。

## 資料流（已由程式碼證實）

1. 選點頁 `save()`（src/page.js:709）→ `GET https://gs-loc.apple.com/wloc-settings/save?lon=<經度>&lat=<緯度>&acc=25&randomRadius=<半徑>`，`mode:'cors'`。**無 token／Cookie／簽名**（全檔 grep 為 0）。
2. 小火箭規則 `WLOC Settings`（wloc.module [Script] 第二段，type=http-request）命中後**不轉發給 Apple**，由 `dist/wloc-settings.js` 直接冒充回應：寫入 `$persistentStore`（key=`wloc_settings`），回 JSON `{success:true,...}`，並帶 `Access-Control-Allow-Origin: *`（前端才讀得到）。
3. `locationd` 之後任何一次網路定位查詢 `gs-loc(.cn).apple.com/clls/wloc`（或 gsp-ssl、高德 bluedot）→ 規則 `Apple WLOC`（type=http-response, requires-body=1, binary-body-mode=1）→ `dist/wloc.js`：
   - 座標優先序（函式 `Ze()`，@39079）：`wloc_settings` 持久化 > 模組 `argument` > 預設（null）。
   - 覆寫 protobuf：field1=round(1e8×lat)、field2=round(1e8×lon)、field3=accuracy（@33524）；其餘欄位原樣保留（`o.push(e.raw)`）；gzip 自動增減壓、重算 `Content-Length`。
   - 任何解析失敗 → `catch` 回傳**原始回應**（透傳，@35639 "no patchable wloc payload"）。
4. 清除：選點頁「清除」→ `?action=clear` → `wloc_settings` 寫 null → wloc.js 退回模組 argument 或透傳。

## 五個獨立事實（不可互相推論）

| # | 事實 | 验证途径 | 目前狀態 |
|---|---|---|---|
| 1 | 模組已下載 | 小火箭→模組清單出現「Apple WLOC 定位修改」 | 待測（使用者） |
| 2 | 模組已啟用 | 開關為綠、[MITM] 網域出現在全域 MITM 名單 | 待測（使用者） |
| 3 | 請求命中規則 | 小火箭「日誌/活動」出現 `gs-loc.apple.com/wloc-settings/save` 與 `/clls/wloc` 記錄 | 待測（使用者） |
| 4 | 回應被修改 | 腳本日誌 `[wloc] ... patched=N` 且 N≥1；save 回 `success:true` | 待測（使用者） |
| 5 | App／系統採用 | 地圖 App 定位落到測試座標 | 待測（使用者） |

**特別**：第 5 項的「iOS 系統 GPS」與「網路定位」要分開看——本機制只可能影響網路定位（WiFi／基站），純 GPS 場景改變與否**無法由 1–4 推論**，屬目前架構的不保證事項（README 注意事項已載明）。

## 元件必要性判定（第三階段）

| 元件 | 必要性 | 依據 | 缺少時 | 小火箭已提供？ | 更簡方案／代價 |
|---|---|---|---|---|---|
| 代理通道（小火箭模式） | 必要 | 規則與腳本只在流量過代理時執行 | 一切不生效（退回真實定位） | 是 | 無須另建 |
| VPN／Packet Tunnel | 目前不需要 | wloc.module 只用 [MITM]+[Script]，無 NE 依賴 | 不影響（本方案走代理） | 代理即夠 | WLoc 原生版才需要 |
| HTTPS MITM | **必要** | gs-loc 回應是 TLS 加密的 protobuf，`requires-body=1,binary-body-mode=1` 只能於解密後取得 | 讀不到 body＝不改座標 | 是（既有能力） | 無替代（不解密就無法改回覆內容） |
| 受信任 CA | **必要（沿用既有）** | MITM 簽葉證書需裝置「完全信任」root CA | TLS 交握失敗／App 顯示連線錯誤 | 是——小火箭既有的那張，**不需新裝** | 不得為測試再裝新 CA |
| 自建本機 HTTPS Proxy | 不需要 | 專案內無任何本機 proxy 實作 | 無影響 | 被 MITM 功能取代 | — |
| iOS 開發者定位模擬（WrapPin 路線） | 不需要（除非要改純 GPS） | 完全不同機制（RSD/DVT），非網路層 | 維持現況 | 否 | 需開發者模式＋PolyForm 非商用授權，成本極高 |

## 真機測試程序（使用者執行，回傳非敏感結果）

**前置檢查（不許變更任何設定，只確認）**
- 小火箭已啟用且模式=代理（非直連）；模組清單有 wloc 模組且開啟。
- 設定→一般→關於→憑證信任設定：小火箭 CA「完全信任」維持現狀（本測試**不安裝、不刪除**任何憑證）。

**測試 1：save 請求**
1. 用 Safari 開 `https://wloc-spoofer.trend0522.workers.dev/`（走小火箭）。
2. 點一個**辨識度高、與你真實位置不同**的測試點（例：東京駅 35.681,139.767；或手機加 `?lat=35.68&lng=139.69` 直接預填——注意此功能尚未部署，用舊版就手動點）。
3. 按「儲存到裝置」。
   - 回傳：按鈕是否變「已儲存」、有無紅色錯誤橫幅（不要貼截圖裡的其他內容）。

**測試 2：查询閉環**
4. 重新整理頁面 → 「目前生效位置」區塊是否顯示刚才的座標（這代表 query 請求也被腳本接管＝規則命中證據之一）。
   - 回傳：顯示／未顯示／錯誤。

**測試 3：規則命中記錄**
5. 小火箭→活動/日誌，找兩筆（只看網域與時間，**其他欄位勿外流**）：
   - `gs-loc.apple.com/wloc-settings/save`（應有，200）
   - `gs-loc.apple.com/clls/wloc` 或 `gs-loc-cn`／`gsp-ssl.ls.apple.com`（任意時間有即可）。
   - 回傳：有／無、狀態碼、大約時間。

**測試 4：定位採用**
6. 關掉精靈：關閉所有後台地圖 App，重開「地圖」或「Google 地圖」，按定位鈕；或在網頁 mapmine 類測試頁看座標。
   - 回傳：顯示位置≈測試點／≈真實點／混合波動（randomRadius=0 時不應波動）。
7. （進階，選做）開飛航模式再關——若位置跳回真實點，即「純 GPS 不受影響」的獨立證據。

**測試 5：失敗路徑（安全，全部可逆）**
8. 小火箭**暫時**切「直連」（不關模組、不改設定）→ 再按「儲存到裝置」→ 預期**錯誤橫幅**（request 出網到真 Apple 伺服器回非 JSON/被 CORS 擋）。測完切回代理。
9. 網站按「清除」→ 回傳是否顯示已清除；之後定位應緩慢回到真實（網路定位重新解析）。

**回傳格式（不含任何敏感值）**：每步一行「步驟／結果／觀察時間」，日誌只抄網域+狀態碼。**不要**貼完整請求 URL 以外的個人欄位、裝置名稱、其他 App 流量。

## 判定表（真機回填後更新）

| 項目 | 預期 | 實際 | 證據 | 狀態 |
|---|---|---|---|---|
| save 回應 success | JSON success:true（經攔截） | 待填 | 按鈕變綠/已儲存 | 待測 |
| query 閉環 | 顯示測試座標 | 待填 | 生效位置區塊 | 待測 |
| /clls/wloc 命中 | 日誌有記錄 | 待填 | 小火箭活動頁 | 待測 |
| 回應修改 | patched≥1（logLevel=info 可見） | 待填 | 腳本日誌末行 | 待測 |
| App 採用 | 地圖定位≈測試點 | 待填 | App 截圖（去個資） | 待測 |
| 系統 GPS（獨立） | 不保證改變（飛航模式測試） | 待填 | 步驟 7 | 待測·架構上不保證 |
| 直連失敗路徑 | 錯誤橫幅 | 待填 | 步驟 8 | 待測 |
| 清除還原 | 定位回真實 | 待填 | 步驟 9 | 待測 |

## 已證實層級分界（本輪）
- **程式碼證實**：上述資料流 1–4（含 ACAO 標頭、座標優先序、透傳防呆、無憑證以外秘密）。
- **自動化通過**：選點頁 37 瀏覽器斷言＋33 單元（feat 分支，未部署）。
- **真機驗證**：0 項——全部「待測」，無 iPhone 可用，絕不冒充。
- **待驗證（上游宣稱）**：iOS 26 快取重開機、iOS 27 beta 拒收非 Apple CA。
- **無法證實**：locationd 內部融合權重（各 App 行為差異）——只能逐 App 觀察。
