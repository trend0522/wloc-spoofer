// 純函式級迴歸測試, 不聯網。運行: npm test  (等價於 node --test test/)
//
// 這裡鎖住的每一條幾乎都對應一個真實踩過的坑 —— 解析類程式碼的失敗模式不是拋錯,
// 而是「靜默回傳一個看起來很正常的錯誤座標」, 只有把已知正確的行為釘死, 下一次
// 改正則時才有東西攔得住。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractFromString,
  extractBaiduFromBody,
  bd09mcToBd09,
  toWgs84,
  wgs84ToGcj02,
  gcj02ToWgs84,
  usesWgs84Locally,
  inMainlandChina,
  isAllowedHost,
  parseCoords,
  inRange,
  round6,
} from "../src/parse.js";
import { GCJ_BROWSER_JS } from "../src/gcj-browser.js";

// 兩點間距離(米), 用於把「差了多少」說成人能判斷的單位而不是小數位數。
function distMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const c = Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(a.lon - b.lon));
  return Math.acos(Math.min(1, Math.max(-1, c))) * R;
}

const near = (got, want, tolDeg = 1e-6) => {
  assert.ok(got, "期望解析成功, 實際回傳 null");
  assert.ok(Math.abs(got.lat - want.lat) < tolDeg, `lat ${got.lat} != ${want.lat}`);
  assert.ok(Math.abs(got.lon - want.lon) < tolDeg, `lon ${got.lon} != ${want.lon}`);
  if (want.src !== undefined) assert.equal(got.src, want.src);
};

test("Google: 取地點針腳 !3d!4d, 不取相機視口 @", () => {
  // @ 後面那組是視口中心, 與縮放級別綁定, 實測能離目標 13 公里。
  const u =
    "https://www.google.com/maps/place/Apple+Park/@37.4391234,-122.0515788,11.21z/data=" +
    "!4m6!3m5!1s0x808fb596e9e188fd:0x3b0d8391510688f0!8m2!3d37.3346438!4d-122.008972!16s%2Fg%2F11bzx2n6td";
  near(extractFromString(u), { lat: 37.3346438, lon: -122.008972, src: "google" });
  assert.equal(extractFromString(u).name, "Apple Park");
});

test("Google: 沒有針腳時才退回視口 @", () => {
  near(extractFromString("https://www.google.com/maps/@37.4391234,-122.0515788,11z"), {
    lat: 37.4391234,
    lon: -122.0515788,
    src: "google",
  });
});

test("正文掃描必須關掉裸座標兜底", () => {
  // 百度頁面裡的 "view_dir":"-0.8477,0.0000,-0.53" 會被裸座標規則命中,
  // 結果是把一個視角向量當成經緯度回傳。
  const body = '{"a":1,"view_dir":"-0.8477,0.0000,-0.53"}';
  assert.equal(extractFromString(body, { allowBare: false }), null);
  near(extractFromString(body), { lat: -0.8477, lon: 0, src: "text" }); // 允許兜底時確實會命中
});

test("ll= 必須有詞邊界, 否則 scroll=/pull= 都會被當成座標", () => {
  assert.equal(extractFromString("scroll=1.5,2.5", { allowBare: false }), null);
  near(extractFromString("https://x/?ll=39.908823,116.397470"), {
    lat: 39.908823,
    lon: 116.39747,
    src: "apple",
  });
});

test("百度 BD09MC -> BD09 -> WGS84 全鏈路 (基準: 深圳萬象天地)", () => {
  const hit = extractBaiduFromBody('"x":"12686385.66","y":"2560876.53"');
  assert.equal(hit.src, "baidu");
  const w = toWgs84(hit.lat, hit.lon, "baidu");
  const truth = { lat: 22.544865, lon: 113.951072 }; // 實測 GPS 基準
  assert.ok(distMeters(w, truth) < 30, `偏差 ${distMeters(w, truth).toFixed(1)} 米, 應 < 30`);
});

test("百度: 標準 Web 墨卡託逆算是錯的, 必須走分段多項式", () => {
  // 用標準墨卡託反算同一組 x/y, 看看差多少 —— 差到公里級就說明係數表不能省。
  const x = 12686385.66, y = 2560876.53;
  const webMercator = {
    lon: (x / 20037508.34) * 180,
    lat: (Math.atan(Math.exp(((y / 20037508.34) * 180 * Math.PI) / 180)) * 360) / Math.PI - 90,
  };
  const correct = bd09mcToBd09(x, y);
  assert.ok(distMeters(webMercator, correct) > 5000, "兩種算法應當差出公里級");
});

test("百度: 像素級 x/y 不得被當成墨卡托米制", () => {
  assert.equal(extractBaiduFromBody('"x":"320","y":"480"'), null);
});

test("百度網頁版 URL 裡的 BD09MC: /poi/名稱/@x,y,19z", () => {
  // 港澳台的百度分享短連結在伺服器端拿不到座標(需頁面腳本帶反爬令牌查 detailConInfo),
  // 但使用者在瀏覽器打開後網址列會變成這個形式, 複製過來就能解析 —— 這是那條唯一
  // 走得通的路, 必須守住。下列 x/y 均為瀏覽器實測所得。
  const 用例 = [
    ["香港 ifc", "12709535.375,2529761.45", { lat: 22.284774, lon: 114.159437 }, 100],
    ["台北 101", "13533702.855,2862107.79", { lat: 25.033626, lon: 121.564215 }, 100],
    ["澳门 Galaxy", "12642194.145,2513614.06", { lat: 22.148148, lon: 113.555399 }, 300],
  ];
  for (const [名, xy, truth, tol] of 用例) {
    const u = `https://map.baidu.com/poi/Apple/@${xy},19z?uid=abc`;
    const hit = extractFromString(u);
    assert.ok(hit, `${名} 未解析出座標`);
    assert.equal(hit.src, "baidu");
    const w = toWgs84(hit.lat, hit.lon, hit.src);
    const d = distMeters(w, truth);
    assert.ok(d < tol, `${名} 偏差 ${d.toFixed(0)} 米, 應 < ${tol}`);
  }
  // 地名從路徑裡取
  assert.equal(
    extractFromString("https://map.baidu.com/poi/Apple%E5%8F%B0%E5%8C%97101/@13533702.855,2862107.79,19z").name,
    "Apple台北101"
  );
});

test("百度的米制 @ 規則不得吃掉 Google 的經緯度 @", () => {
  // 兩者都是 @a,b 形式, 靠位數區分: 墨卡託是 6~9 位整數, 經緯度是 1~3 位。
  near(extractFromString("https://www.google.com/maps/@37.4391234,-122.0515788,11z"), {
    lat: 37.4391234,
    lon: -122.0515788,
    src: "google",
  });
  // 非百度域名的大數字 @ 不該被當成 BD09MC
  assert.equal(extractFromString("https://example.com/x/@12709535.375,2529761.45,19z"), null);
});

test("迴歸: 蘋果 / 高德 / 裸文本的原有行為不變", () => {
  near(
    extractFromString("https://maps.apple.com/place?coordinate=31.230416,121.473701&name=%E5%A4%96%E6%BB%A9"),
    { lat: 31.230416, lon: 121.473701, src: "apple" }
  );
  assert.equal(
    extractFromString("https://maps.apple.com/place?coordinate=31.230416,121.473701&name=%E5%A4%96%E6%BB%A9").name,
    "外滩"
  );
  near(extractFromString("https://amap.com/?q=39.908823,116.397470,天安门"), {
    lat: 39.908823,
    lon: 116.39747,
    src: "amap",
  });
  near(extractFromString("39.908823,116.397470"), { lat: 39.908823, lon: 116.39747, src: "text" });
});

test("高德 URI: lnglat= / position= 是「經度,緯度」序", () => {
  // 這兩個鍵與上面所有規則的順序相反。曾經由頁面本地規則處理, 改成統一走伺服器端
  // 之後伺服器端不認, 掉進裸座標兜底 -> 經緯顛倒 -> 回傳 lat=113.9 這種越界值。
  near(extractFromString("https://ditu.amap.com/?lnglat=113.9494,22.5448"), {
    lat: 22.5448,
    lon: 113.9494,
    src: "amap",
  });
  near(extractFromString("https://uri.amap.com/marker?position=116.473195,39.993253&name=%E4%B8%AD%E5%85%B3%E6%9D%91"), {
    lat: 39.993253,
    lon: 116.473195,
    src: "amap",
  });
  assert.equal(
    extractFromString("https://uri.amap.com/marker?position=116.473195,39.993253&name=%E4%B8%AD%E5%85%B3%E6%9D%91").name,
    "中关村"
  );
});

test("越界座標一律不回傳", () => {
  // 兜底規則不帶語義, 命中什麼就是什麼。值域驗證是最後一道閘, 它不需要理解
  // 任何一種連結格式, 就能把「解析失敗」和「解析成錯的」區分開。
  assert.equal(extractFromString("?q=999.1234,888.5678"), null);
  assert.equal(extractFromString("coordinate=91.12345,181.98765"), null);
  assert.equal(extractFromString("?ll=1234.5678,12.3456"), null);
  assert.ok(inRange(22.5, 113.9));
  assert.ok(!inRange(91, 0));
  assert.ok(!inRange(0, 181));
  assert.ok(!inRange(NaN, 0));
});

test("toWgs84: 按來源分派, text 源不做任何換算", () => {
  const p = { lat: 22.547674, lon: 113.962501 };
  for (const src of ["apple", "amap", "google"]) {
    const w = toWgs84(p.lat, p.lon, src);
    assert.ok(distMeters(w, p) > 300, `${src} 在境內應當有 GCJ 偏移`);
  }
  assert.deepEqual(toWgs84(p.lat, p.lon, "text"), p);
  assert.deepEqual(toWgs84(p.lat, p.lon, undefined), p);
});

// ── 港澳台 ──────────────────────────────────────────────────────────
// 每個基準點都是分享連結裡的原始值, 與設備 GPS 逐位相同, 即真值本身。
const HK = { lat: 22.284774, lon: 114.159437 }; // ifc mall
const MO = { lat: 22.148148, lon: 113.555399 }; // Galaxy Macau
const TW = { lat: 25.033626, lon: 121.564215 }; // Taipei 101

test("港澳台: 蘋果/Google 發的是 WGS84, 不得再做 GCJ 反算", () => {
  for (const [名, p] of [["香港", HK], ["澳門", MO], ["台灣", TW]]) {
    for (const src of ["apple", "google"]) {
      const w = toWgs84(p.lat, p.lon, src);
      assert.ok(
        distMeters(w, p) < 0.001,
        `${名} ${src} 被改動了 ${distMeters(w, p).toFixed(0)} 米, 應原樣回傳`
      );
    }
  }
});

test("港澳台: 高德/百度仍是偏移座標, 必須繼續換算", () => {
  // 實測依據: 把衛星圖與高德瓦片放在同一座標上比對, 香港的高德圖差 596 米,
  // 與大陸同量級 —— 高德在港澳台並沒有改用 WGS84。
  for (const [名, p] of [["香港", HK], ["澳門", MO], ["台灣", TW]]) {
    const w = toWgs84(p.lat, p.lon, "amap");
    assert.ok(
      distMeters(w, p) > 300,
      `${名} 高德只改動了 ${distMeters(w, p).toFixed(0)} 米, 應當有 GCJ 量級的偏移`
    );
    assert.ok(!usesWgs84Locally(p.lat, p.lon, "amap"), `${名} amap 不該走 WGS84 直通`);
    assert.ok(!usesWgs84Locally(p.lat, p.lon, "baidu"), `${名} baidu 不該走 WGS84 直通`);
  }
});

test("香港邊界: 深圳一側必須仍按大陸處理", () => {
  // 香港北界緊貼深圳, 用矩形圈會把這些點一起吞掉 —— 那才是最常用的座標區域。
  const 深圳 = [
    ["万象天地", 22.544865, 113.951072],
    ["蛇口海上世界", 22.4795, 113.9245],
    ["福田口岸", 22.5310, 114.0730],
    ["罗湖", 22.5480, 114.1180],
    ["盐田", 22.5570, 114.2350],
  ];
  for (const [名, lat, lon] of 深圳) {
    assert.ok(!usesWgs84Locally(lat, lon, "apple"), `${名} 被誤判成香港`);
    assert.ok(distMeters(toWgs84(lat, lon, "apple"), { lat, lon }) > 300, `${名} 應當做 GCJ 換算`);
  }
});

test("香港邊界: 香港一側必須按 WGS84 處理", () => {
  const 香港 = [
    ["中环 ifc", 22.284774, 114.159437],
    ["元朗", 22.4450, 114.0300],
    ["天水围", 22.4580, 114.0050],
    ["上水", 22.5010, 114.1280],
    ["赤鱲角机场", 22.3080, 113.9180],
    ["西贡", 22.3830, 114.2710],
  ];
  for (const [名, lat, lon] of 香港) {
    assert.ok(usesWgs84Locally(lat, lon, "apple"), `${名} 未被辨識為香港`);
  }
});

test("港澳台判定不得波及大陸其它城市", () => {
  const 大陸 = [
    ["北京", 39.908823, 116.39747],
    ["上海", 31.230416, 121.473701],
    ["广州", 23.129163, 113.264435],
    ["厦门", 24.4798, 118.0894], // 緊鄰金門, 台灣框不得吞掉
    ["福州", 26.0745, 119.2965],
    ["珠海拱北", 22.2230, 113.5480], // 緊鄰澳門關閘
    ["温州", 27.9940, 120.6990],
  ];
  for (const [名, lat, lon] of 大陸) {
    assert.ok(!usesWgs84Locally(lat, lon, "apple"), `${名} 被誤判成港澳台`);
    assert.ok(distMeters(toWgs84(lat, lon, "apple"), { lat, lon }) > 300, `${名} 應當做 GCJ 換算`);
  }
});

test("境外座標不做 GCJ 換算 (out_of_china)", () => {
  const apple = { lat: 37.334859, lon: -122.00904 };
  assert.deepEqual(toWgs84(apple.lat, apple.lon, "apple"), apple);
});

// ── 粗矩形內的鄰國城市 ─────────────────────────────────────────────
// gcjOutOfChina 的矩形把整個東亞/東南亞/南亞都圈進去; 蘋果/Google 在這些地方發的
// 是 WGS84, 反算一次會偏 160~540 米。
test("迴歸: 首爾/大阪/新加坡的蘋果/Google 座標不得做 GCJ 反算", () => {
  const 境外 = [
    ["首爾 市廳", 37.5665, 126.978],
    ["大阪 梅田", 34.7025, 135.4959],
    ["新加坡 濱海灣", 1.2834, 103.8607],
  ];
  for (const [名, lat, lon] of 境外) {
    const p = { lat, lon };
    for (const src of ["apple", "google"]) {
      assert.ok(usesWgs84Locally(lat, lon, src), `${名} ${src} 應走 WGS84 直通`);
      assert.deepEqual(toWgs84(lat, lon, src), p, `${名} ${src} 應原樣回傳`);
    }
  }
});

test("大陸多邊形: 鄰國城市在外, 大陸邊陲城市在內", () => {
  const 外 = [
    ["首爾", 37.5665, 126.978], ["釜山", 35.18, 129.08], ["平壤", 39.03, 125.75],
    ["大阪", 34.6937, 135.5023], ["福岡", 33.59, 130.4], ["那霸", 26.21, 127.68],
    ["德里", 28.61, 77.21], ["加德滿都", 27.7, 85.32], ["達卡", 23.81, 90.41],
    ["馬尼拉", 14.6, 120.98], ["曼谷", 13.75, 100.5], ["新加坡", 1.3521, 103.8198],
    ["河內", 21.03, 105.85], ["仰光", 16.8, 96.15], ["烏蘭巴托", 47.92, 106.92],
    ["海參崴", 43.12, 131.89], ["阿拉木圖", 43.24, 76.89], ["台北", 25.03, 121.56],
  ];
  const 內 = [
    ["北京", 39.9, 116.4], ["上海", 31.23, 121.47], ["深圳", 22.54, 113.95],
    ["三亞", 18.25, 109.5], ["烏魯木齊", 43.83, 87.62], ["喀什", 39.47, 75.99],
    ["拉薩", 29.65, 91.17], ["漠河", 52.97, 122.54], ["琿春", 42.87, 130.36],
    ["丹東", 40.12, 124.38], ["昆明", 25.04, 102.71], ["滿洲里", 49.6, 117.43],
    ["二連浩特", 43.65, 111.98], ["黑河", 50.24, 127.49], ["撫遠", 48.36, 134.29],
  ];
  for (const [名, lat, lon] of 外) assert.ok(!inMainlandChina(lat, lon), `${名} 被誤判為大陸`);
  for (const [名, lat, lon] of 內) {
    assert.ok(inMainlandChina(lat, lon), `${名} 未被辨識為大陸`);
    assert.ok(!usesWgs84Locally(lat, lon, "apple"), `${名} 蘋果應做 GCJ 換算`);
  }
});

test("鄰國座標: 高德/百度來源仍照舊換算 (不受大陸判定影響)", () => {
  const seoul = { lat: 37.5665, lon: 126.978 };
  assert.ok(!usesWgs84Locally(seoul.lat, seoul.lon, "amap"));
  assert.ok(distMeters(toWgs84(seoul.lat, seoul.lon, "amap"), seoul) > 100);
});

// ── /api/parse 主機白名單 ──────────────────────────────────────────
test("主機白名單: 只放行已知地圖服務, 尾綴必須帶點", () => {
  for (const h of [
    "maps.apple.com", "surl.amap.com", "uri.amap.com", "amap.com", "map.baidu.com",
    "j.map.baidu.com", "maps.app.goo.gl", "goo.gl", "www.google.com", "maps.google.com",
  ]) assert.ok(isAllowedHost(h), `${h} 應放行`);
  for (const h of [
    "example.com", "evilamap.com", "amap.com.evil.io", "notbaidu.com", "google.com.hk.evil",
    "apple.com", "x.goo.gl", "localhost",
  ]) assert.ok(!isAllowedHost(h), `${h} 不應放行`);
});

async function withFetch(fake, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

test("parseCoords: 白名單外的主機不發出任何請求", async () => {
  let called = 0;
  await withFetch(async () => { called++; throw new Error("不該被調用"); }, async () => {
    await assert.rejects(parseCoords("https://example.com/abc"), /不支援的連結來源/);
  });
  assert.equal(called, 0);
});

test("parseCoords: 每一跳重新導向都檢查白名單", async () => {
  const seen = [];
  const fake = async (u) => {
    seen.push(String(u));
    // 白名單內的短鏈跳去白名單外 —— 下一跳不得被請求。
    return new Response(null, { status: 302, headers: { location: "https://evil.example/next" } });
  };
  await withFetch(fake, async () => {
    await assert.rejects(parseCoords("https://maps.app.goo.gl/xyz"));
  });
  assert.deepEqual(seen, ["https://maps.app.goo.gl/xyz"]);
});

test("parseCoords: 白名單內的多跳重新導向照常展開", async () => {
  const fake = async (u) => {
    if (String(u).startsWith("https://surl.amap.com/")) {
      return new Response(null, { status: 302, headers: { location: "https://wb.amap.com/redirect" } });
    }
    return new Response(null, {
      status: 302,
      headers: { location: "https://uri.amap.com/marker?position=113.951072,22.544865&name=x" },
    });
  };
  const hit = await withFetch(fake, () => parseCoords("https://surl.amap.com/abc"));
  near(hit, { lat: 22.544865, lon: 113.951072, src: "amap" });
});

test("gcj02ToWgs84 是 wgs84ToGcj02 的逆運算, 殘差 < 0.1 米", () => {
  for (const p of [
    { lat: 22.544865, lon: 113.951072 },
    { lat: 39.908823, lon: 116.39747 },
    { lat: 31.230416, lon: 121.473701 },
    { lat: 45.75, lon: 126.63 },
  ]) {
    const g = wgs84ToGcj02(p.lat, p.lon);
    const back = gcj02ToWgs84(g.lat, g.lon);
    assert.ok(distMeters(back, p) < 0.1, `殘差 ${distMeters(back, p).toFixed(3)} 米`);
  }
});

test("注入頁面的 GCJ 實現與伺服器端逐點一致", () => {
  // gcj-browser.js 是 parse.js 的鏡像副本(頁面拿不到伺服器端函式)。這條測試是那份
  // 副本唯一的防漂移手段 —— 少了它, 兩邊遲早各改各的。
  const sandbox = {};
  new Function("exports", GCJ_BROWSER_JS + "\nexports.w = wgs84ToGcj02; exports.g = gcj02ToWgs84;")(sandbox);
  for (let la = 20; la <= 50; la += 3.7) {
    for (let lo = 75; lo <= 135; lo += 7.3) {
      assert.deepEqual(sandbox.w(la, lo), wgs84ToGcj02(la, lo), `wgs84ToGcj02(${la},${lo}) 兩邊不一致`);
      assert.deepEqual(sandbox.g(la, lo), gcj02ToWgs84(la, lo), `gcj02ToWgs84(${la},${lo}) 兩邊不一致`);
    }
  }
  // 境外分支也要一致
  assert.deepEqual(sandbox.w(37.334859, -122.00904), wgs84ToGcj02(37.334859, -122.00904));
});

test("round6 保留 6 位小數 (約 0.1 米)", () => {
  assert.equal(round6(22.5448651234), 22.544865);
  assert.equal(round6(-122.0090401), -122.00904);
});
