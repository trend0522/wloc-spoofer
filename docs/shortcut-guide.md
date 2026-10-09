# WLOC 虛擬定位 - 使用說明

> 本檔衍生自上游 [ios151/wloc](https://github.com/ios151/wloc) 的 `docs/shortcut-guide.md`，經繁體中文（台灣用語）在地化，並改指向本專案的 Worker。

## 運作原理

```
使用者在手機 Safari 開啟選點頁面
  → 地圖選位置 / 搜尋地名 / 貼上地圖連結
  → 點選「儲存到裝置」
  → 頁面請求 https://gs-loc.apple.com/wloc-settings/save?lon=x&lat=y
  → 代理模組攔截請求 → wloc-settings.js 寫入 $persistentStore
  → 下次 Apple 定位觸發 → wloc.js 讀取座標 → 修改定位回應
```

如果模組未啟用 → 請求不會被攔截 → 頁面提示檢查 MITM／模組設定。

---

## 使用方法

### 1. 安裝模組（一次性）
訂閱對應平台的模組並啟用 MITM。

### 2. 開啟選點頁面
在 Safari 中開啟選點頁面（建議加入主畫面）：
```
https://wloc-spoofer.trend0522.workers.dev/
```
自行部署的話，把上面的網址換成你自己的 worker 網址。

> Worker 不儲存任何資料。座標直接寫入你的裝置本機；`/api/parse` 只在解析連結時
> 暫時向地圖服務發一次請求，處理完即丟，不寫儲存、不落日誌。

### 3. 選擇位置
- **點擊地圖** — 直接點選
- **搜尋地名** — 輸入「台北 101」等關鍵字
- **貼上連結** — 從 Apple Maps / Google Maps / 高德 / 百度複製分享連結
- **目前位置** — 使用瀏覽器定位

### 4. 儲存到裝置
點選「儲存到裝置」→ 顯示 ✓ 即成功。

---

## 部署選點頁面（Worker）

本倉庫為扁平結構（無 `worker/` 子目錄），無需任何綁定：

```bash
npm install
npm run deploy
```

不需要 KV、不需要資料庫、不需要環境變數。

> Worker 由 `src/` 下的多個模組打包而成（頁面模板、連結解析、座標換算），
> 不能靠在 Dashboard 裡貼上單一檔案來部署，請用上面的 wrangler 流程。

---

## 模組設定

模組包含兩條腳本規則（已自動設定，使用者無需操作）：

| 規則 | 類型 | 路徑 | 作用 |
|------|------|------|------|
| Apple WLOC | http-response | `/clls/wloc` | 修改定位回應 |
| WLOC Settings | http-request | `/wloc-settings/save` | 接收選點頁面寫入 |

MITM 主機名：`gs-loc.apple.com, gs-loc-cn.apple.com, gsp-ssl.ls.apple.com, bluedot.is.autonavi.com, bluedot.is.autonavi.com.gds.alibabadns.com`（已包含在模組中）

---

## 儲存失敗排查

頁面顯示紅色提示時，檢查：
1. **模組已啟用** — 在代理工具中確認 WLOC 模組開關開啟
2. **MITM 憑證** — 已安裝並信任 CA 憑證
3. **MITM 主機名** — 包含 `gs-loc.apple.com`
4. **代理連線** — 目前網路走代理（Safari 請求會經過代理）

> ⚠️ iOS 27 beta 6 起系統禁止對 `gs-loc.apple.com` 進行 MITM 攔截，詳見 README。

---

## 備選：手動編輯（BoxJS）

不使用選點頁面時，可在 BoxJS 中直接編輯 `wloc_settings`：
```json
{"longitude":121.4737,"latitude":31.2304,"accuracy":25}
```

優先順序：已儲存座標 > 模組引數 > 預設值
