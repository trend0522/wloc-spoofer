// 客戶端座標邏輯的單一來源。函式本身給 node 測試直接 import，
// COORD_JS 把它們原樣轉成字串注入選點頁 —— 注入的就是被测的，不會分叉。
// （與 gcj-browser.js「注入頁面與服務端逐點一致」的測試思路相同。）

// 緯度 -90..90、經度 -180..180，必須是有限數字。
// 空字串/null/undefined/NaN/Infinity 都會被 Number.isFinite 擋下。
export function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
         Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

// 本地捷徑：從地圖連結/純座標文字猜 lat,lon。只負責「猜」，
// 範圍守門由呼叫端用 validCoord 做（超界一律視為解析失敗）。
export function parseMapUrl(text) {
  let m;
  m = text.match(/ll=([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  m = text.match(/@([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  m = text.match(/lnglat=([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
  m = text.match(/(?:location|center)=([0-9.-]+),([0-9.-]+)/);
  if (m) return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
  m = text.match(/(-?[0-9]+\.[0-9]+)[,\s]+(-?[0-9]+\.[0-9]+)/);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    // 緯度絕對值不超過 90, 經度可達 180: 按絕對值判斷谁是經度, 否則
    // -122.009 這類西經會被當成緯度 (-122 < 90 恒成立)。
    if (Math.abs(a) <= 90 && Math.abs(b) > 90) return { lat: a, lon: b };
    if (Math.abs(b) <= 90 && Math.abs(a) > 90) return { lat: b, lon: a };
    return { lat: a, lon: b };
  }
  return null;
}

// ?lat=<緯度>&lng=<經度> 預填。兩參數必須同時存在且都合法才套用；
// 名稱與順序固定：lat 是緯度, lng 是經度。重複參數取第一個
// （URLSearchParams.get 的語意）。呼叫端只在初始載入時用一次。
// parseFloat('25abc') 會吃掉前綴數字, 非法尾巴不能放過: 全程用 Number()。
export function pickPrefill(search) {
  const p = new URLSearchParams(search);
  const latS = p.get('lat'), lngS = p.get('lng');
  if (latS === null || lngS === null || !latS.trim() || !lngS.trim()) return null;
  const vLat = Number(latS), vLng = Number(lngS);
  if (!validCoord(vLat, vLng)) return null;
  return { lat: vLat, lon: vLng };
}

// 搜尋結果消毒：丟掉非物件、非數字、超界的項目, 名字欄位轉成字串。
export function sanitizeResults(results) {
  if (!Array.isArray(results)) return [];
  const out = [];
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const la = Number(r.lat), lo = Number(r.lon);
    if (!validCoord(la, lo)) continue;
    out.push({
      name: String(r.name || '').slice(0, 60),
      detail: String(r.detail || '').slice(0, 120),
      lat: la,
      lon: lo
    });
  }
  return out;
}

export const COORD_JS = [validCoord, parseMapUrl, pickPrefill, sanitizeResults]
  .map(f => f.toString()).join('\n');
