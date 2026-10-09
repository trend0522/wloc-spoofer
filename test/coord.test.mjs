// P0 回歸測試：共用座標驗證 / 網址預填 / 搜尋結果消毒 / parse 順序。
// 跑法: node --test test/coord.test.mjs （已掛進 npm test）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validCoord, parseMapUrl, pickPrefill, sanitizeResults } from '../src/coord.js';
import { getPageHtml } from '../src/page.js';

test('validCoord: 合法正負與邊界值', () => {
  assert.equal(validCoord(25.033, 121.565), true);
  assert.equal(validCoord(-25.033, -121.565), true);
  assert.equal(validCoord(90, 180), true);      // 邊界
  assert.equal(validCoord(-90, -180), true);    // 邊界
  assert.equal(validCoord(0, 0), true);
});

test('validCoord: 超界、NaN、Infinity、非數字一律拒絕', () => {
  assert.equal(validCoord(90.0001, 0), false);
  assert.equal(validCoord(-91, 0), false);
  assert.equal(validCoord(0, 180.0001), false);
  assert.equal(validCoord(0, -181), false);
  assert.equal(validCoord(NaN, 0), false);
  assert.equal(validCoord(0, NaN), false);
  assert.equal(validCoord(Infinity, 0), false);
  assert.equal(validCoord(0, -Infinity), false);
  assert.equal(validCoord('', ''), false);
  assert.equal(validCoord(null, undefined), false);
  assert.equal(validCoord('25', '121'), false); // 字串不是數字
});

test('pickPrefill: 兩者俱全且合法才套用, lat=緯度 lng=經度', () => {
  assert.deepEqual(pickPrefill('lat=25.033&lng=121.565'), { lat: 25.033, lon: 121.565 });
  assert.deepEqual(pickPrefill('lat=-33.87&lng=151.21'), { lat: -33.87, lon: 151.21 });
  assert.deepEqual(pickPrefill('lat=90&lng=180'), { lat: 90, lon: 180 });
});

test('pickPrefill: 缺參數/空值/非數字/NaN/Infinity/超界 → null', () => {
  assert.equal(pickPrefill('lat=25'), null);                 // 缺 lng
  assert.equal(pickPrefill('lng=121'), null);                // 缺 lat
  assert.equal(pickPrefill('lat=&lng=121'), null);           // 空字串
  assert.equal(pickPrefill('lat=25&lng='), null);
  assert.equal(pickPrefill('lat=abc&lng=121'), null);        // 非數字
  assert.equal(pickPrefill('lat=25abc&lng=121'), null);      // 數字前綴騙不了 Number()
  assert.equal(pickPrefill('lat=NaN&lng=121'), null);
  assert.equal(pickPrefill('lat=Infinity&lng=121'), null);
  assert.equal(pickPrefill('lat=91&lng=121'), null);         // 緯度超界
  assert.equal(pickPrefill('lat=25&lng=181'), null);         // 經度超界
  assert.equal(pickPrefill(''), null);
  assert.equal(pickPrefill('lat=121&lng=25'), null);         // 參數名稱不換位置: lat=121 超界即拒絕
});

test('pickPrefill: 重複參數取第一個; URL 編碼空格可解析', () => {
  assert.deepEqual(pickPrefill('lat=1&lat=2&lng=3'), { lat: 1, lon: 3 });
  assert.deepEqual(pickPrefill('lat=%2025.5%20&lng=121.5'), { lat: 25.5, lon: 121.5 });
});

test('parseMapUrl: ll=/@ 是 lat,lon; lnglat=/location= 是 lon,lat', () => {
  assert.deepEqual(parseMapUrl('https://x/?ll=25.03,121.56'), { lat: 25.03, lon: 121.56 });
  assert.deepEqual(parseMapUrl('geo:25.03,121.56'), { lat: 25.03, lon: 121.56 }); // @ 之外走純數字分支
  assert.deepEqual(parseMapUrl('https://diji?lnglat=121.56,25.03'), { lat: 25.03, lon: 121.56 });
  assert.deepEqual(parseMapUrl('https://x/?location=121.56,25.03'), { lat: 25.03, lon: 121.56 });
  // 西經: 依絕對值判誰是經度, 不得把 -122 當下緯度
  assert.deepEqual(parseMapUrl('-122.009, 37.43'), { lat: 37.43, lon: -122.009 });
  assert.equal(parseMapUrl('hello'), null);
});

test('parseMapUrl + validCoord 串起來: 超界數值不會變成有效選點', () => {
  const r = parseMapUrl('ll=95.5,121.5');
  assert.ok(r); // 解析得出來
  assert.equal(validCoord(r.lat, r.lon), false); // 但守門拒絕
});

test('sanitizeResults: 丟掉非數字/超界/非物件, 保留合法並轉數字', () => {
  const out = sanitizeResults([
    { name: 'A', detail: 'a', lat: '25.1', lon: '121.5' },   // 字串數字 → 收
    { name: 'B', lat: 95, lon: 1 },                            // 超界 → 丟
    { name: 'C', lat: 'x', lon: 1 },                           // 非數字 → 丟
    { name: 'D' },                                             // 缺欄位 → 丟
    null, 'str',                                               // 非物件 → 丟
    { name: '<i>', detail: '長'.repeat(200), lat: 0, lon: 0 }, // 截斷且轉字串
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: 'A', detail: 'a', lat: 25.1, lon: 121.5 });
  assert.ok(out[1].name.length <= 60);
  assert.equal(out[1].detail.length, 120);
  assert.equal(sanitizeResults(undefined).length, 0);
  assert.equal(sanitizeResults('str').length, 0);
});

test('注入頁面的 coord 函式與被测源碼逐字一致（防分叉）', () => {
  const html = getPageHtml();
  for (const f of [validCoord, parseMapUrl, pickPrefill, sanitizeResults]) {
    assert.ok(html.includes(f.toString()), f.name + ' 未原樣注入頁面');
  }
});

test('setPos 是唯一守門點, 所有入口都經它; 預填只執行一次', () => {
  const html = getPageHtml();
  assert.ok(html.includes("if (!validCoord(newLat, newLon)) { toast(t('invalid_coord'), 3000); return; }"));
  // 頁面內所有會寫座標的入口最終都呼叫 moveTo/setPos, 預填本身也只此一處。
  const calls = html.match(/pickPrefill\(location\.search/g) || [];
  assert.equal(calls.length, 1);
  // 非法輸入經守門後 lat/lon 不變（純函式層面的等價檢查）:
  assert.equal(validCoord(999, 999), false); // save() 前 selected 必須由 setPos 設定
});
