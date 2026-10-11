// scripts/build-dist.mjs — 層級 2 overlay 注入式 dist 建置（方案 A 安全網）
//
// 上游 ios151/wloc 只發布 minified dist（無源碼，實查 worker/src 僅網頁檔）。
// 直接手改壓縮檔=不可審計的永久分叉；這裡改成：
//   dist-base/（上游 dist 原件，一字不改、diff 可驗證）
// + modules-src/（未壓縮、可審閱的 route overlay 源）
//   → 錨點注入 → dist/
// 任何錨點缺失或不唯一 = 構建失敗（exit 1），絕不靜默跳過。
// 上游 sync 流程：覆蓋 dist-base/ → `npm run build:dist` → 跑測試 → 錨點若斷裂即報錯，
// 由人重對錨點——取代「在壓縮檔裡手眼重放」。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (p) => readFile(path.join(root, p), "utf8");
// DIST_OUT lets the drift test build to a temp dir instead of overwriting committed dist/
const outDir = process.env.DIST_OUT || path.join(root, "dist");

function injectOnce(src, anchor, replacement, label) {
  const first = src.indexOf(anchor);
  if (first === -1) throw new Error(`錨點缺失 [${label}]：build 中止，上游 dist 可能已變更，需人工重對錨點`);
  if (src.indexOf(anchor, first + 1) !== -1) throw new Error(`錨點不唯一 [${label}]：拒絕猜測注入位置`);
  return src.slice(0, first) + replacement + src.slice(first + anchor.length);
}

const baseWloc = await read("dist-base/wloc.js");
const baseSettings = await read("dist-base/wloc-settings.js");
const overlayRead = await read("modules-src/route-overlay.js");
const overlayWrite = await read("modules-src/route-settings-overlay.js");

// ---- wloc.js：重命名原 Ze → ZeBase，注入 overlay，再以 Ze 包裝（路線點覆寫單點） ----
let wloc = injectOnce(
  baseWloc,
  "function Ze(){const e=globalThis.$argument||{}",
  "function ZeBase(){const e=globalThis.$argument||{}",
  "wloc:rename-Ze"
);
wloc = injectOnce(
  wloc,
  ",r}let ze;",
  `,r}
${overlayRead}
function Ze(){var r=ZeBase();try{var raw=o.getItem(WLOC_ROUTE_KEY);if(raw){var p=wlocRoutePosition(raw,Date.now());if(p){r.longitude=p.longitude;r.latitude=p.latitude;if(!p.paused)t.info("[wloc] 路線模擬 dist="+p.distM+"/"+p.totalM+"m"+(p.arrived?"(已抵達,停留終點)":"")+" lon="+p.longitude.toFixed(6)+" lat="+p.latitude.toFixed(6));}else{t.error("[wloc] 路線模擬資料未通過驗證,回落單點模式");}}}catch(e){t.error("[wloc] 路線模擬異常,回落單點模式: "+(e.message||e))}return r}let ze;`,
  "wloc:wrap-Ze"
);

// ---- wloc-settings.js：注入寫入端 overlay + route-* 攔截（置于原 action 鏈之前） ----
let settings = injectOnce(
  baseSettings,
  ";let g;if(t.debug(",
  `;
${overlayWrite}
let g;if(d&&String(d).indexOf("route-")===0){g=wlocRouteHandle(d,u,c,function(m){t.info(m)})||{success:false,error:"未知的路線操作"};}else if(t.debug(`,
  "settings:route-dispatch"
);

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "wloc.js"), wloc, "utf8");
await writeFile(path.join(outDir, "wloc-settings.js"), settings, "utf8");

// 完成性斷言：產物必須同時含基線契約與 overlay 符號
const asserts = [
  [wloc, "wloc_settings", "wloc 基線 key"],
  [wloc, "113.94114===r.longitude&&22.544577===r.latitude", "wloc 透傳判定"],
  [wloc, "wlocRoutePosition", "wloc overlay"],
  [settings, 'const n="wloc_settings"', "settings 基線 key"],
  [settings, "wlocRouteHandle", "settings overlay"],
  [settings, "route-clear", "settings route actions"],
];
for (const [src, needle, label] of asserts) {
  if (!src.includes(needle)) throw new Error(`產物斷言失敗：${label}`);
}
console.log("build-dist OK:",
  `wloc.js ${wloc.length}B (base ${baseWloc.length}B, +${wloc.length - baseWloc.length}B)`,
  `| wloc-settings.js ${settings.length}B (base ${baseSettings.length}B, +${settings.length - baseSettings.length}B)`);
