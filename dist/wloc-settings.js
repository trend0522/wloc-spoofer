/* wloc-settings.js - Build 2026-08-16 16:56:29 */
const e=(()=>{const e=e=>e in globalThis;switch(!0){case e("$task"):return"Quantumult X";case e("$loon"):return"Loon";case e("$rocket"):return"Shadowrocket";case e("Egern"):return"Egern";case Boolean(globalThis.$environment?.["surge-version"]):return"Surge";case Boolean(globalThis.$environment?.["stash-version"]):return"Stash";case e("Cloudflare"):return"Worker";case Boolean(globalThis.process?.versions?.node):return"Node.js";default:return}})();class t{static#e=new Map([]);static#t=[];static#a=new Map([]);static clear=()=>{};static count=(e="default")=>{switch(t.#e.has(e)){case!0:t.#e.set(e,t.#e.get(e)+1);break;case!1:t.#e.set(e,0)}t.log(`${e}: ${t.#e.get(e)}`)};static countReset=(e="default")=>{switch(t.#e.has(e)){case!0:t.#e.set(e,0),t.log(`${e}: ${t.#e.get(e)}`);break;case!1:t.warn(`Counter "${e}" doesn’t exist`)}};static debug=(...e)=>{t.#s<4||(e=e.map(e=>` ${e}`),t.log(...e))};static error(...a){if(!(t.#s<1)){switch(e){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":case"Quantumult X":default:a=a.map(e=>` ${e}`);break;case"Worker":case"Node.js":a=a.map(e=>` ${e?.stack??e}`)}t.log(...a)}}static exception=(...e)=>t.error(...e);static group=e=>t.#t.unshift(e);static groupEnd=()=>t.#t.shift();static info(...e){t.#s<3||(e=e.map(e=>` ${e}`),t.log(...e))}static#s=3;static get logLevel(){switch(t.#s){case 0:return"OFF";case 1:return"ERROR";case 2:return"WARN";case 3:default:return"INFO";case 4:return"DEBUG";case 5:return"ALL"}}static set logLevel(e){switch(typeof e){case"string":e=e.toLowerCase();break;case"number":break;default:e="warn"}switch(e){case 0:case"off":t.#s=0;break;case 1:case"error":t.#s=1;break;case 2:case"warn":case"warning":default:t.#s=2;break;case 3:case"info":t.#s=3;break;case 4:case"debug":t.#s=4;break;case 5:case"all":t.#s=5}}static log=(...e)=>{0!==t.#s&&(e=e.flatMap(e=>{switch(typeof e){case"object":return[JSON.stringify(e)];case"bigint":case"number":case"boolean":return[e.toString()];case"string":return e.split(/\r?\n/u);default:return[e]}}),t.#t.forEach(t=>{(e=e.map(e=>`  ${e}`)).unshift(` ${t}:`)}),e=["",...e],console.log(e.join("\n")))};static time=(e="default")=>t.#a.set(e,Date.now());static timeEnd=(e="default")=>t.#a.delete(e);static timeLog=(e="default")=>{const a=t.#a.get(e);a?t.log(`${e}: ${Date.now()-a}ms`):t.warn(`Timer "${e}" doesn’t exist`)};static warn(...e){t.#s<2||(e=e.map(e=>` ${e}`),t.log(...e))}}class a{static escape(e){const t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};return e.replace(/[&<>"']/g,e=>t[e])}static get(e={},t="",s=void 0){Array.isArray(t)||(t=a.toPath(t));const r=t.reduce((e,t)=>Object(e)[t],e);return void 0===r?s:r}static merge(e,...t){if(null==e)return e;for(const s of t)if(null!=s)for(const t of Object.keys(s)){const r=s[t],o=e[t];switch(!0){case a.#r(r)&&a.#r(o):e[t]=a.merge(o,r);break;case r instanceof Map&&o instanceof Map:if(r.size>0)for(const[e,t]of r)o.set(e,t);break;case r instanceof Set&&o instanceof Set:if(r.size>0)for(const e of r)o.add(e);break;case Array.isArray(r)&&0===r.length&&void 0!==o:case r instanceof Map&&0===r.size&&void 0!==o:case r instanceof Set&&0===r.size&&void 0!==o:break;case void 0!==r:e[t]=r}}return e}static#r(e){if(null===e||"object"!=typeof e)return!1;const t=Object.getPrototypeOf(e);return null===t||t===Object.prototype}static omit(e={},t=[]){return Array.isArray(t)||(t=[t.toString()]),t.forEach(t=>a.unset(e,t)),e}static pick(e={},t=[]){Array.isArray(t)||(t=[t.toString()]);const a=Object.entries(e).filter(([e,a])=>t.includes(e));return Object.fromEntries(a)}static set(e,t,s){return Array.isArray(t)||(t=a.toPath(t)),t.slice(0,-1).reduce((e,a,s)=>Object(e[a])===e[a]?e[a]:e[a]=/^\d+$/.test(t[s+1])?[]:{},e)[t[t.length-1]]=s,e}static toPath(e){return e.replace(/\[(\d+)\]/g,".$1").split(".").filter(Boolean)}static unescape(e){const t={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"};return e.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,e=>t[e])}static unset(e={},t=""){Array.isArray(t)||(t=a.toPath(t));return t.reduce((e,a,s)=>s===t.length-1?(delete e[a],!0):Object(e)[a],e)}}class s{static parse(e){let t={};switch(typeof e){case"string":{const r=e.replace(/^\?/,"");if(!r)break;const o=Object.fromEntries(r.split("&").filter(Boolean).map(e=>{const[t="",a=""]=e.split("=",2);return[s.#o(t).replace(/\[([^\[\]]+)\]/g,".$1"),s.#o(a).replace(/\"/g,"")]}));Object.keys(o).forEach(e=>a.set(t,e,o[e]));break}case"object":switch(e){case null:break;default:{const s={};Object.keys(e).forEach(t=>a.set(s,t,e[t])),t=s;break}}break;case"undefined":t={}}return t}static stringify(e={}){if(!e||"object"!=typeof e)return"";const t=[];return Object.keys(e).forEach(a=>s.#c(e,a,t)),0===t.length?"":t.map(([e,t])=>`${s.#n(s.#i(e))}=${s.#n(t)}`).join("&")}static#c(e,t,r){const o=a.get(e,t);void 0!==o&&(null!==o?Array.isArray(o)?o.forEach((a,o)=>{void 0!==a&&s.#c(e,`${t}[${o}]`,r)}):s.#r(o)?Object.keys(o).forEach(a=>s.#c(e,`${t}.${a}`,r)):r.push([t,String(o)]):r.push([t,""]))}static#i(e){const[t,...s]=a.toPath(e);return s.reduce((e,t)=>/^\d+$/.test(t)?`${e}[${t}]`:`${e}.${t}`,t)}static#r(e){if(null===e||"object"!=typeof e||Array.isArray(e))return!1;const t=Object.getPrototypeOf(e);return null===t||t===Object.prototype}static#n(e){return encodeURIComponent(e)}static#o(e){return decodeURIComponent(e.replace(/\+/g," "))}}t.debug(" $argument"),globalThis.$argument=s.parse(globalThis.$argument),globalThis.$argument.LogLevel&&(t.logLevel=globalThis.$argument.LogLevel),t.debug(" $argument",`$argument: ${JSON.stringify(globalThis.$argument)}`);const r={100:"Continue",101:"Switching Protocols",102:"Processing",103:"Early Hints",200:"OK",201:"Created",202:"Accepted",203:"Non-Authoritative Information",204:"No Content",205:"Reset Content",206:"Partial Content",207:"Multi-Status",208:"Already Reported",226:"IM Used",300:"Multiple Choices",301:"Moved Permanently",302:"Found",304:"Not Modified",307:"Temporary Redirect",308:"Permanent Redirect",400:"Bad Request",401:"Unauthorized",402:"Payment Required",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",406:"Not Acceptable",407:"Proxy Authentication Required",408:"Request Timeout",409:"Conflict",410:"Gone",411:"Length Required",412:"Precondition Failed",413:"Content Too Large",414:"URI Too Long",415:"Unsupported Media Type",416:"Range Not Satisfiable",417:"Expectation Failed",418:"I'm a teapot",421:"Misdirected Request",422:"Unprocessable Entity",423:"Locked",424:"Failed Dependency",425:"Too Early",426:"Upgrade Required",428:"Precondition Required",429:"Too Many Requests",431:"Request Header Fields Too Large",451:"Unavailable For Legal Reasons",500:"Internal Server Error",501:"Not Implemented",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout",505:"HTTP Version Not Supported",506:"Variant Also Negotiates",507:"Insufficient Storage",508:"Loop Detected",510:"Not Extended",511:"Network Authentication Required"};function o(s={}){switch(e){case"Surge":s.policy&&a.set(s,"headers.X-Surge-Policy",s.policy),t.log(" 執行結束!",` ${(new Date).getTime()/1e3-$script.startTime} 秒`),$done(s);break;case"Loon":s.policy&&(s.node=s.policy),t.log(" 執行結束!",` ${(new Date-$script.startTime)/1e3} 秒`),$done(s);break;case"Stash":s.policy&&a.set(s,"headers.X-Stash-Selected-Proxy",encodeURI(s.policy)),t.log(" 執行結束!",` ${(new Date-$script.startTime)/1e3} 秒`),$done(s);break;case"Egern":case"Shadowrocket":t.log(" 執行結束!"),$done(s);break;case"Quantumult X":switch(s.policy&&a.set(s,"opts.policy",s.policy),typeof(s=a.pick(s,["status","url","headers","body","bodyBytes"])).status){case"number":s.status=`HTTP/1.1 ${s.status} ${r[s.status]}`;break;case"string":case"undefined":break;default:throw new TypeError(`${Function.name}: 參數類型錯誤, status 必須為數字或字串`)}s.body instanceof ArrayBuffer?(s.bodyBytes=s.body,s.body=void 0):ArrayBuffer.isView(s.body)?(s.bodyBytes=s.body.buffer.slice(s.body.byteOffset,s.body.byteLength+s.body.byteOffset),s.body=void 0):s.body&&(s.bodyBytes=void 0),t.log(" 執行結束!"),$done(s);break;case"Worker":default:t.log(" 執行結束!");break;case"Node.js":t.log(" 執行結束!"),process.exit(1)}}class c{static data=null;static dataFile="box.dat";static#l=/^@(?<key>[^.]+)(?:\.(?<path>.*))?$/;static getItem(t,s=null){let r=s;switch(t.startsWith("@")){case!0:{const{key:e,path:s}=t.match(c.#l)?.groups;t=e;let o=c.getItem(t,{});"object"!=typeof o&&(o={}),r=a.get(o,s);try{r=JSON.parse(r)}catch{}break}default:switch(e){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":r=$persistentStore.read(t);break;case"Quantumult X":r=$prefs.valueForKey(t);break;case"Worker":c.data=c.data??{},r=c.data[t];break;case"Node.js":c.data=c.#u(c.dataFile),r=c.data?.[t];break;default:r=c.data?.[t]||null}try{r=JSON.parse(r)}catch{}}return r??s}static setItem(t=new String,s=new String){let r=!1;if("object"==typeof s)s=JSON.stringify(s);else s=String(s);switch(t.startsWith("@")){case!0:{const{key:e,path:o}=t.match(c.#l)?.groups;t=e;let n=c.getItem(t,{});"object"!=typeof n&&(n={}),a.set(n,o,s),r=c.setItem(t,n);break}default:switch(e){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":r=$persistentStore.write(s,t);break;case"Quantumult X":r=$prefs.setValueForKey(s,t);break;case"Worker":c.data=c.data??{},c.data[t]=s,r=!0;break;case"Node.js":c.data=c.#u(c.dataFile),c.data[t]=s,c.#d(c.dataFile),r=!0;break;default:r=c.data?.[t]||null}}return r}static removeItem(t){let s=!1;switch(t.startsWith("@")){case!0:{const{key:e,path:r}=t.match(c.#l)?.groups;t=e;let o=c.getItem(t);"object"!=typeof o&&(o={}),a.unset(o,r),s=c.setItem(t,o);break}default:switch(e){case"Surge":s=$persistentStore.write(null,t);break;case"Loon":case"Stash":case"Egern":case"Shadowrocket":default:s=!1;break;case"Quantumult X":s=$prefs.removeValueForKey(t);break;case"Worker":c.data=c.data??{},delete c.data[t],s=!0;break;case"Node.js":c.data=c.#u(c.dataFile),delete c.data[t],c.#d(c.dataFile),s=!0}}return s}static clear(){let t=!1;switch(e){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":default:t=!1;break;case"Quantumult X":t=$prefs.removeAllValues();break;case"Worker":c.data={},t=!0;break;case"Node.js":c.data=c.#u(c.dataFile),c.data={},c.#d(c.dataFile),t=!0}return t}static#u=t=>{if("Node.js"!==e)return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(t),a=this.path.resolve(process.cwd(),t),s=this.fs.existsSync(e),r=!s&&this.fs.existsSync(a);if(!s&&!r)return{};{const t=s?e:a;try{return JSON.parse(this.fs.readFileSync(t))}catch(e){return{}}}}};static#d=(t=this.dataFile)=>{if("Node.js"===e){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const e=this.path.resolve(t),a=this.path.resolve(process.cwd(),t),s=this.fs.existsSync(e),r=!s&&this.fs.existsSync(a),o=JSON.stringify(this.data);s?this.fs.writeFileSync(e,o):r?this.fs.writeFileSync(a,o):this.fs.writeFileSync(e,o)}}}const n="wloc_settings",i=$request.url||"";function l(e){return parseFloat(String(e||"0").replace(",","."))}const u=function(e){const t=e.split("?")[1]||"",a=new Map;for(const e of t.split("&")){if(!e)continue;const t=e.indexOf("="),s=-1===t?e:e.slice(0,t),r=-1===t?"":e.slice(t+1);let o,c;try{o=decodeURIComponent(s.replace(/\+/g," "))}catch{o=s}try{c=decodeURIComponent(r.replace(/\+/g," "))}catch{c=r}a.has(o)||a.set(o,c)}return a}(i),d=u.get("action")||"save";
// 層級 2 路線模擬 overlay（寫入端）——錨點注入 dist/wloc-settings.js。
// 由 scripts/build-dist.mjs 注入。新 action 全部走 route-* 前綴，
// 不觸碰既有 query/clear/save 的 wloc_settings 五欄路徑。
//
// 契約（docs/route-simulation-level2-plan.md §3.2）：
//   ?action=route-set&shape=<p6>&speed=1.4&mult=1&t0=<ms>&mode=walking&provider=valhalla
//   ?action=route-pause / route-resume / route-clear / route-status
// 讀端（dist/wloc.js）對欄位再驗證；這裡的驗證是第一道（信任邊界=使用者輸入）。

var WLOC_ROUTE_KEY = "wloc_route";

// polyline6 解碼計點（寫入端第一道；截斷/超點數回 null）
function wlocRouteCountPoints(str) {
  var count = 0, index = 0, lat = 0, lon = 0, len = str.length;
  while (index < len) {
    var b, shift = 0, result = 0;
    do { if (index >= len) return null; b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    if (Math.abs(lat) > 90000000) return null;
    shift = 0; result = 0;
    do { if (index >= len) return null; b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    if (Math.abs(lon) > 180000000) return null;
    count++;
    if (count > 800) return null;
  }
  return count >= 2 ? count : null;
}

function wlocRouteValidate(params) {
  var shape = params.get("shape") || "";
  // Google polyline 字元集=ASCII 0x3F–0x7E；& = # 不在其中，可安全置於已編碼 query
  if (!shape || shape.length > 3000 || !/^[\x3F-\x7E]+$/.test(shape)) return { error: "shape 無效或過長" };
  // 寫入端也做點數上限（與讀端同規則解碼计数；解碼器兩腳本各自內嵌、由漂移測試守同步）
  if (wlocRouteCountPoints(shape) === null) return { error: "shape 解碼失敗或點數超出 2–800" };
  var speed = parseFloat(params.get("speed"));
  if (!Number.isFinite(speed) || speed <= 0 || speed > 80) return { error: "speed 必須在 0–80 m/s" };
  var mult = parseFloat(params.get("mult"));
  if (!Number.isFinite(mult) || mult <= 0 || mult > 10) return { error: "mult 必須在 0–10" };
  var t0 = parseInt(params.get("t0"), 10);
  if (!Number.isFinite(t0) || t0 < 946684800000 || t0 > Date.now() + 31536000000) return { error: "t0 時間戳不合理" };
  var mode = String(params.get("mode") || "walking").slice(0, 16);
  var provider = String(params.get("provider") || "valhalla").slice(0, 16);
  return { ok: true, route: { v: 1, mode: mode, provider: provider, shape: shape, speed: speed, mult: mult, t0: t0, pausedMs: 0, pauseStart: null } };
}

function wlocRouteHandle(action, params, store, log) {
  try {
    if (action === "route-set") {
      var check = wlocRouteValidate(params);
      if (!check.ok) return { success: false, error: check.error };
      if (!store.setItem(WLOC_ROUTE_KEY, check.route)) { log("[wloc-settings] 路線寫入 setItem 回傳 false"); return { success: false, error: "寫入失敗" }; }
      log("[wloc-settings] 路線模擬已寫入 wloc_route");
      return { success: true, action: "route-set", v: 1, mode: check.route.mode, speed: check.route.speed, mult: check.route.mult, t0: check.route.t0 };
    }
    if (action === "route-pause") {
      var cur = store.getItem(WLOC_ROUTE_KEY);
      if (!cur || cur.v !== 1) return { success: false, error: "沒有進行中的路線模擬" };
      if (cur.pauseStart) return { success: true, action: "route-pause", paused: true }; // 冪等
      cur.pauseStart = Date.now();
      if (!store.setItem(WLOC_ROUTE_KEY, cur)) return { success: false, error: "寫入失敗" };
      return { success: true, action: "route-pause", paused: true };
    }
    if (action === "route-resume") {
      var cur2 = store.getItem(WLOC_ROUTE_KEY);
      if (!cur2 || cur2.v !== 1) return { success: false, error: "沒有進行中的路線模擬" };
      if (cur2.pauseStart) { cur2.pausedMs = (Number(cur2.pausedMs) || 0) + Math.max(0, Date.now() - cur2.pauseStart); cur2.pauseStart = null; }
      if (!store.setItem(WLOC_ROUTE_KEY, cur2)) return { success: false, error: "寫入失敗" };
      return { success: true, action: "route-resume", paused: false, pausedMs: cur2.pausedMs };
    }
    if (action === "route-clear") {
      store.setItem(WLOC_ROUTE_KEY, null);
      log("[wloc-settings] 已清除 wloc_route（wloc_settings 不受影響）");
      return { success: true, action: "route-clear" };
    }
    if (action === "route-status") {
      var st = store.getItem(WLOC_ROUTE_KEY);
      if (!st || st.v !== 1) return { success: true, active: false };
      return { success: true, active: true, mode: st.mode, speed: st.speed, mult: st.mult, t0: st.t0, pausedMs: st.pausedMs || 0, paused: !!st.pauseStart, shape: st.shape };
    }
    return null; // 非 route action → 交回原邏輯
  } catch (e) {
    return { success: false, error: e.message || "路線操作失敗" };
  }
}

let g;if(d&&String(d).indexOf("route-")===0){g=wlocRouteHandle(d,u,c,function(m){t.info(m)})||{success:false,error:"未知的路線操作"};}else if(t.debug(`[wloc-settings] url=${i}, action=${d}`),"query"===d)try{const e=c.getItem(n);e&&"object"==typeof e&&e.longitude&&e.latitude?(g={success:!0,longitude:e.longitude,latitude:e.latitude,accuracy:e.accuracy||25,randomRadius:e.randomRadius??0,updatedAt:e.updatedAt||null},t.debug(`[wloc-settings] 查詢: ${e.longitude}, ${e.latitude}`)):g={success:!1,error:"無已儲存的座標"}}catch(e){g={success:!1,error:e.message||"讀取失敗"}}else if("clear"===d)try{c.setItem(n,null),g={success:!0},t.info("[wloc-settings] 已清除座標資料")}catch(e){g={success:!1,error:e.message||"清除失敗"},t.error(`[wloc-settings] 清除失敗: ${e.message}`)}else{const e=l(u.get("lon")||u.get("longitude")),a=l(u.get("lat")||u.get("latitude")),s=parseInt(u.get("acc")||u.get("accuracy")||"25",10);if(!Number.isFinite(e)||!Number.isFinite(a)||Math.abs(a)>90||Math.abs(e)>180)g={success:!1,error:"缺少 lon/lat 參數"};else{let r={};try{const e=c.getItem(n);e&&"object"==typeof e&&(r=e)}catch{}const o={...r,longitude:e,latitude:a,accuracy:s,updatedAt:new Date(Date.now()+288e5).toISOString().replace("Z","+08:00")},i=u.get("randomRadius");null!=i&&""!==i&&(o.randomRadius=l(i));try{c.setItem(n,o)?(g={success:!0,longitude:e,latitude:a,accuracy:s,randomRadius:o.randomRadius??0},t.info(`[wloc-settings] 已儲存: ${e}, ${a}`)):(g={success:!1,error:"Storage.setItem 回傳 false"},t.error("[wloc-settings] setItem 回傳 false"))}catch(e){g={success:!1,error:e.message||"寫入失敗"},t.error(`[wloc-settings] ${e.message}`)}}}const p={status:200,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS"},body:JSON.stringify(g)};o("Quantumult X"===e?p:{response:p});
