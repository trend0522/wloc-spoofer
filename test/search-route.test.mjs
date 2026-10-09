// /api/search 降級契約回歸（P0-1 驗收）：正常／HTTP 錯誤／逾時／網路拒絕／格式錯誤
// 直打 Hono app；fetch 以 stub 注入；斷言回應契約永為 200 + {results:[...]}。
import { test } from 'node:test';
import assert from 'node:assert';

globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
const originalFetch = globalThis.fetch;
// Hono 第 4 參數注入 ExecutionContext（c.executionCtx.waitUntil）
const WAITER = { waitUntil: (p) => { p && p.catch && p.catch(() => {}); } };

async function req(app, path) {
  return app.request(path, {}, {}, WAITER);
}
function fakeResp(status, body, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => body };
}
async function withApp(fn) {
  const { default: app } = await import('../src/index.js');
  try { return await fn(app); } finally { globalThis.fetch = originalFetch; }
}

test('正常回應：格式與既有契約一致（name/detail/lat/lon 四欄、數值化）', async () => {
  globalThis.fetch = async () => fakeResp(200, [
    { name: '台北車站', display_name: '台北車站, 台北市', lat: '25.0478', lon: '121.5170' },
    { name: '', display_name: '臺中車站, 台中市', lat: '24.1372', lon: '120.6875' },
  ]);
  await withApp(async (app) => {
    const r = await req(app, '/api/search?q=車站');
    assert.strictEqual(r.status, 200);
    const d = await r.json();
    assert.strictEqual(d.results.length, 2);
    assert.deepStrictEqual(Object.keys(d.results[0]).sort(), ['detail', 'lat', 'lon', 'name']);
    assert.strictEqual(d.results[0].lat, 25.0478);
    assert.strictEqual(d.results[1].name, '臺中車站');
  });
});

test('HTTP 錯誤(403/429/500)：降級 {results:[]}，狀態仍 200', async () => {
  for (const st of [403, 429, 500]) {
    globalThis.fetch = async () => fakeResp(st, { error: 'nope' }, false);
    await withApp(async (app) => {
      const r = await req(app, '/api/search?q=xyz');
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(await r.json(), { results: [] });
    });
  }
});

test('逾時：fetch 帶 AbortSignal 且 AbortSignal.timeout 以 8000ms 呼叫；reject 進降級', async () => {
  let seen = null, ms = null;
  const origTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (t) => { ms = t; return origTimeout.call(AbortSignal, t); };
  globalThis.fetch = async (url, init) => {
    seen = init && init.signal;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  try {
    await withApp(async (app) => {
      const r = await req(app, '/api/search?q=slow');
      assert.deepStrictEqual(await r.json(), { results: [] });
      assert.ok(seen instanceof AbortSignal, 'fetch 未帶 signal');
      assert.strictEqual(ms, 8000);
    });
  } finally { AbortSignal.timeout = origTimeout; }
});

test('網路拒絕(TypeError)：降級 {results:[]}', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await withApp(async (app) => {
    const r = await req(app, '/api/search?q=dead');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { results: [] });
  });
});

test('上游回非陣列 JSON：不 throw，降級空清單', async () => {
  globalThis.fetch = async () => fakeResp(200, { error: 'malformed' });
  await withApp(async (app) => {
    const r = await req(app, '/api/search?q=bad');
    assert.deepStrictEqual(await r.json(), { results: [] });
  });
});

test('非數字座標被濾除（契約：lat/lon 必須 finite）', async () => {
  globalThis.fetch = async () => fakeResp(200, [
    { name: 'ok', display_name: 'ok', lat: '25.1', lon: '121.2' },
    { name: 'bad', display_name: 'bad', lat: 'NaN', lon: '121.2' },
  ]);
  await withApp(async (app) => {
    const d = await (await req(app, '/api/search?q=mix')).json();
    assert.strictEqual(d.results.length, 1);
  });
});

test('q 長度 <2：不出站直接空清單（診斷面板本站探測的前提）', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return fakeResp(200, []); };
  await withApp(async (app) => {
    const r = await req(app, '/api/search?q=_');
    assert.deepStrictEqual(await r.json(), { results: [] });
    assert.strictEqual(called, false, '短查詢不應觸發上游 fetch');
  });
});
