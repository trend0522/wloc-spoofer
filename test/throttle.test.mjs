// P0 節流回歸：per-IP 固定窗。驗證 (1) 出站型請求 20 次/分鐘後降級 (2) 契約不變
// (3) 換 IP 獨立 (4) 窗過期恢復 (5) parse 洪水回 429 {error}。
import { test } from 'node:test';
import assert from 'node:assert';

globalThis.caches = { default: { match: async () => undefined, put: async () => {} } }; // 全部 miss → 每次都是出站計數
const originalFetch = globalThis.fetch;
const WAITER = { waitUntil: (p) => { p && p.catch && p.catch(() => {}); } };

async function req(app, path, ip) {
  return app.request(path, ip ? { headers: { 'x-forwarded-for': ip } } : {}, {}, WAITER);
}
async function withApp(fn) {
  const { default: app } = await import('../src/index.js');
  try { return await fn(app); } finally { globalThis.fetch = originalFetch; }
}

test('search: 同 IP 第 21 個獨詞不再出站且回 limited，契約仍是 200+results 陣列', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return { ok: true, status: 200, json: async () => [] }; };
  await withApp(async (app) => {
    const ip = '9.9.9.' + Math.floor(Math.random() * 250) + '.1';
    for (let i = 0; i < 20; i++) {
      const d = await (await req(app, '/api/search?q=uniq' + i + 'xx', ip)).json();
      assert.ok(!d.limited, '第 ' + i + ' 次不應受限');
    }
    assert.strictEqual(n, 20, '前 20 次應各出站一次');
    const r = await req(app, '/api/search?q=uniq21xx', ip);
    const d = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(d.limited, true);
    assert.ok(Array.isArray(d.results) && d.results.length === 0, '降級契約不變');
    assert.strictEqual(r.headers.get('retry-after'), '60');
    assert.strictEqual(n, 20, '受限請求不得再出站');
  });
});

test('search: 不同 IP 額度獨立', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  await withApp(async (app) => {
    const ipA = '8.8.' + Math.floor(Math.random() * 250) + '.11';
    const ipB = '8.8.' + Math.floor(Math.random() * 250) + '.12';
    for (let i = 0; i < 20; i++) await req(app, '/api/search?q=ipA' + i, ipA);
    const dA = await (await req(app, '/api/search?q=ipA21', ipA)).json();
    const dB = await (await req(app, '/api/search?q=ipB0', ipB)).json();
    assert.strictEqual(dA.limited, true);
    assert.ok(!dB.limited, 'B IP 不應受 A 影響');
  });
});

test('search: 61 秒後窗過期恢復放行', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  try {
    await withApp(async (app) => {
      const ip = '7.7.' + Math.floor(Math.random() * 250) + '.13';
      for (let i = 0; i < 20; i++) await req(app, '/api/search?q=w' + i, ip);
      const d1 = await (await req(app, '/api/search?q=w21', ip)).json();
      assert.strictEqual(d1.limited, true);
      shift = 61000;
      const d2 = await (await req(app, '/api/search?q=w22', ip)).json();
      assert.ok(!d2.limited, '窗過期後應恢復');
    });
  } finally { Date.now = realNow; }
});

test('parse: 洪水第 21 次回 429 + {error}（既有錯誤形態）', async () => {
  await withApp(async (app) => {
    const ip = '6.6.' + Math.floor(Math.random() * 250) + '.14';
    const url = encodeURIComponent('https://maps.apple.com/?ll=25.03,121.56');
    const r0 = await req(app, '/api/parse?u=' + url + '&format=json', ip);
    assert.strictEqual(r0.status, 200);
    for (let i = 0; i < 19; i++) await req(app, '/api/parse?u=' + url + '&format=json', ip);
    const r = await req(app, '/api/parse?u=' + url + '&format=json', ip);
    assert.strictEqual(r.status, 429);
    const d = await r.json();
    assert.strictEqual(typeof d.error, 'string');
    assert.strictEqual(r.headers.get('access-control-allow-origin'), '*');
  });
});
