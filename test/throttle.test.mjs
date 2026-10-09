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

/* ---- 第二輪審核修正：F1 容量逐出 + F3 快取命中不計數 ---- */
import { rateLimited, rlWindows } from '../src/index.js';

test('F1a: 滿載先逐出已過期視窗，倖存使用者的已累計次數不被重置', () => {
  rlWindows.clear();
  const W = 60000, t0 = Date.now();
  for (let i = 0; i < 5001; i++) rlWindows.set('e' + i, { start: t0 - W - 1000, n: 20 }); // 全過期
  rlWindows.set('live', { start: t0, n: 19 }); // 未過期、已燒 19 次
  rateLimited('fresh', 20, W, t0);
  assert.ok(rlWindows.has('live'), '未過期項不得被逐出');
  assert.strictEqual(rlWindows.get('live').n, 19, '計數必須存活（非靜默重置）');
  assert.ok(!rlWindows.has('e0'), '過期項應已被逐出');
  // live 使用者下次請求繼續從 19 往下算：第 20 次放行、第 21 次受限
  assert.strictEqual(rateLimited('live', 20, W, t0), false);
  assert.strictEqual(rateLimited('live', 20, W, t0), true);
  rlWindows.clear();
});

test('F1b: 無足量過期項時的滿載行為＝逐出最舊 1/4（依 start），非全清', () => {
  rlWindows.clear();
  const W = 60000, t0 = Date.now();
  for (let i = 0; i < 5001; i++) rlWindows.set('k' + i, { start: t0 + i, n: 15 }); // 全在窗內，start 遞增
  rlWindows.set('newest', { start: t0 + 99999, n: 19 });
  rateLimited('probe', 20, W, t0);
  assert.ok(rlWindows.has('newest') && rlWindows.get('newest').n === 19, '最新窗必須存活');
  assert.ok(!rlWindows.has('k0'), '最舊項應被逐出');
  assert.ok(!rlWindows.has('k1249'), '最舊 1/4 邊界（cut=1250）內應被逐出');
  assert.ok(rlWindows.has('k1300'), '1/4 邊界外應存活');
  assert.ok(rlWindows.has('k4999'), '較新項應存活 — 證明非全量清空');
  assert.ok(rlWindows.size > 3750 && rlWindows.size <= 5000, '存活量大約 3/4');
  rlWindows.clear();
});

test('F3: 快取命中不消耗額度——同詞 25 次全部正常回應、零出站、之後新詞仍放行', async () => {
  const hitBody = { results: [{ lat: 25.0, lon: 121.5, name: 'cachehit', address: 'x' }] };
  globalThis.caches = { default: {
    match: async (req) => new URL(req.url).searchParams.get('q') === 'popular'
      ? { json: async () => hitBody } : undefined,
    put: async () => {}
  } };
  let n = 0;
  globalThis.fetch = async () => { n++; return { ok: true, status: 200, json: async () => [] }; };
  await withApp(async (app) => {
    const ip = '5.5.' + Math.floor(Math.random() * 250) + '.31';
    for (let i = 0; i < 25; i++) {
      const d = await (await req(app, '/api/search?q=popular', ip)).json();
      assert.ok(!d.limited, '第 ' + i + ' 次快取命中不應受限');
      assert.deepStrictEqual(d.results, hitBody.results, '命中應原樣回傳');
    }
    assert.strictEqual(n, 0, '快取命中期間零上游請求');
    const d2 = await (await req(app, '/api/search?q=freshword', ip)).json();
    assert.ok(!d2.limited, '25 次命中不得吃掉該 IP 的 20 次出站額度');
    assert.strictEqual(n, 1);
  });
  globalThis.fetch = originalFetch;
});

test('F1c: 連續灌 6001 個新 IP，任何時刻 size ≤ 5000 且最新項必在、非全清', () => {
  rlWindows.clear();
  const W = 60000;
  let peak = 0, wiped = false;
  for (let i = 0; i < 6001; i++) {
    rateLimited('ip' + i, 20, W, Date.now() + i); // 每個 start 微递增，模擬輪換 IP
    const before = peak;
    peak = Math.max(peak, rlWindows.size);
    if (before >= 5000 && rlWindows.size < 10) wiped = true; // 已滿載後瞬間崩到個位數＝reset-all；爬坡期 0→1 不算
    assert.ok(rlWindows.has('ip' + i), '剛加入的 IP 必須存在');
  }
  assert.ok(peak <= 5000, '新增後從不超過 5000，實測 peak=' + peak);
  assert.ok(!wiped, '不得出現reset-all 式瞬時崩落');
  assert.ok(rlWindows.size >= 3000, '存活量大約 3/4（存活者計數不被重置）');
  rlWindows.clear();
});
