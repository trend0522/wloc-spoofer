// 驗收用本地伺服器（非部署流程）——本地 stub 化版：
//   預設模式：/ 與 /api/* 全部交給「目前分支的 Hono app」（src/index.js）處理，
//             CI 必跑測試不再依賴正式站；上游 Nominatim 以固定資料桩替換（可重現、防 429 抖動）。
//   ACCEPTANCE_STUB=0  → 上游走真實 Nominatim（手動跑完整鏈路時用）。
//   ACCEPTANCE_LIVE=1  → 舊模式：/api/* 原樣代理正式站唯讀 GET（可選探測，非 CI 必要）。
// 跑法: node scripts/serve-acceptance.mjs [port]
import { createServer } from 'node:http';

const LIVE = 'https://wloc-spoofer.trend0522.workers.dev';
const port = Number(process.argv[2] || 8899);
const LIVE_MODE = process.env.ACCEPTANCE_LIVE === '1';
const STUB = process.env.ACCEPTANCE_STUB !== '0';

// Worker 运行时桩：caches（miss + no-op put）與 ExecutionContext.waitUntil
globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const WAITER = { waitUntil: (p) => { p && p.catch && p.catch(() => {}); } };

// 固定上游資料桩：僅模擬 Nominatim 回應形狀（字串 lat/lon、display_name），
// 命中「車站/台北」回清單、其餘回空——讓瀏覽器測試對 UI 流程斷言時不受上游配額抖動影響。
// 降級契約（HTTP 錯誤/逾時/網路拒絕/垃圾 JSON）由 test/search-route.test.mjs 直打 app 驗證。
const originalFetch = globalThis.fetch;
if (STUB) {
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const q = decodeURIComponent((u.match(/[?&]q=([^&]+)/) || [])[1] || '');
    let results = [];
    if (/台北市/.test(q)) {
      results = [{ name: '台北市', display_name: '台北市, 台灣', lat: '25.03', lon: '121.56' }]; // 單筆→自動套用路徑
    } else if (/車|站/.test(q)) {
      results = [
        { name: '台北車站', display_name: '台北車站, 台北市, 台灣', lat: '25.0478', lon: '121.5170' },
        { name: '松山車站', display_name: '松山車站, 台北市, 台灣', lat: '25.0505', lon: '121.5759' },
      ]; // 多筆→可選列表路徑
    }
    return { ok: true, status: 200, json: async () => results };
  };
  // parse.js 的跟隨抓取用 text()：給不含座標的殼頁 → extractFromString(target) 本地先命中，
  // isFetchable 迴圈根本不會啟動（url 已帶 ll= 座標）；即便啟動也 merely 拿到空殼。
  const stubFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('nominatim')) return stubFetch(u, init);
    return { ok: true, status: 200, json: async () => [], text: async () => '<html>stub</html>', headers: { get: () => null } };
  };
}

const { default: app } = await import('../src/index.js');

async function handleLocal(req, res) {
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok, err) => {
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', err);
  });
  const h = {}; for (let i = 0; i < req.rawHeaders.length; i += 2) h[req.rawHeaders[i].toLowerCase()] = req.rawHeaders[i + 1];
  const r = await app.fetch(new Request('http://127.0.0.1:' + port + req.url, { method: req.method, headers: h, body }), {}, WAITER);
  res.writeHead(r.status, Object.fromEntries(r.headers) );
  res.end(Buffer.from(await r.arrayBuffer()));
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (LIVE_MODE && url.pathname.startsWith('/api/')) {
      const r = await originalFetch(LIVE + url.pathname + url.search);
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(await r.text());
    } else {
      await handleLocal(req, res); // 真正的本地 Worker 路由（/、/api/search、/api/parse、404）
    }
  } catch (e) {
    res.writeHead(500); res.end(String(e && e.message));
  }
}).listen(port, '127.0.0.1', () => console.log('acceptance server on 127.0.0.1:' + port + (LIVE_MODE ? ' [LIVE proxy]' : STUB ? ' [local app + stub upstream]' : ' [local app + live Nominatim]')));
