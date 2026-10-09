// 驗收用本地伺服器（非部署流程）：
//   /           → 本地 getPageHtml()（驗證的就是工作區目前原始碼）
//   /api/*      → 原樣代理到正式站唯讀 GET（不寫任何資料）
// 用途：第二輪驗收的真瀏覽器測試。跑法: node scripts/serve-acceptance.mjs [port]
import { createServer } from 'node:http';
import { getPageHtml } from '../src/page.js';

const LIVE = 'https://wloc-spoofer.trend0522.workers.dev';
const port = Number(process.argv[2] || 8899);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getPageHtml());
    } else if (url.pathname.startsWith('/api/')) {
      const r = await fetch(LIVE + url.pathname + url.search);
      res.writeHead(r.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(await r.text());
    } else {
      res.writeHead(404); res.end('');
    }
  } catch (e) {
    res.writeHead(500); res.end(String(e && e.message));
  }
}).listen(port, '127.0.0.1', () => console.log('acceptance server on 127.0.0.1:' + port));
