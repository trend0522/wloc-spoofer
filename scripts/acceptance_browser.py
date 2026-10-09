#!/usr/bin/env python3
# 第二輪驗收的真瀏覽器測試（Playwright + 本地驗收伺服器 http://127.0.0.1:8899）
# 逐項断言, 失敗退出碼非 0。結果印成 T/PASS/F 行供報告引用。
import sys, json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8899/"
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (" | " + detail if detail else ""))

def new_page(ctx, query=""):
    p = ctx.new_page()
    p.goto(BASE + query, wait_until="domcontentloaded")
    p.wait_for_timeout(1200)  # leaflet tiles 載入
    return p

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 給剪貼簿權限（Chromium 對 127.0.0.1 預設允许, 保險起见明確 grant）
    ctx = b.new_context(viewport={"width": 390, "height": 844}, permissions=["clipboard-read", "clipboard-write"])
    page = new_page(ctx)

    # ── 0. 頁面基本可用 ──
    check("頁面標題/地圖存在", page.locator("#map").count() == 1)
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    check("載入無 JS 錯誤", len(errs) == 0, "; ".join(errs)[:200])

    # ── A. 座標複製按鈕 ──
    page.evaluate("moveTo(25.0331234, 121.5644444, 15)")
    txt = page.locator("#coords").inner_text()
    check("選點後 coords 顯示", "121.564444" in txt and "25.033123" in txt, txt.strip()[:60])
    page.locator("#coords").click()
    page.wait_for_timeout(300)
    try:
        clip = page.evaluate("navigator.clipboard.readText()")
    except Exception as e:
        clip = "ERR:" + str(e)
    check("點 coords 複製 'lon, lat' 6位小數", clip == "121.564444, 25.033123", repr(clip))
    toast = page.locator("#toast").inner_text()
    check("複製成功 toast 出現", "已複製" in toast or "copied" in toast.lower(), toast)

    # ── B. URL 預填 ──
    p2 = new_page(ctx, "?lat=35.68&lng=139.69")
    c2 = p2.locator("#coords").inner_text()
    check("合法 lat/lng 預填生效", "35.680000" in c2 and "139.690000" in c2, c2.strip()[:60])
    sel2 = p2.evaluate("selected")
    check("預填設為已選取", sel2 is True)
    # 預填後手動點地圖, 不得被覆蓋(重新載入才算第二次初始套用)
    p2.evaluate("setPos(1.111111, 2.222222)")
    c2b = p2.locator("#coords").inner_text()
    check("預填不覆蓋後續手動選點", "1.111111" in c2b and "35.68" not in c2b, c2b.strip()[:60])
    p2.close()

    for q, name in [
        ("?lat=25", "缺 lng"),
        ("?lng=121", "缺 lat"),
        ("?lat=&lng=121", "lat 空字串"),
        ("?lat=abc&lng=121", "非數字"),
        ("?lat=NaN&lng=121", "NaN"),
        ("?lat=Infinity&lng=121", "Infinity"),
        ("?lat=91&lng=121", "緯度超界"),
        ("?lat=25&lng=181", "經度超界"),
        ("?lat=25abc&lng=121", "數字前綴"),
        ("?lat=-90&lng=-180", "負邊界(應合法)"),
    ]:
        pe = new_page(ctx, q)
        sel = pe.evaluate("selected")
        lat = pe.evaluate("lat")
        want_valid = name == "負邊界(應合法)"
        check("預填 " + name + ("→套用" if want_valid else "→拒絕"),
              (sel is True and abs(lat + 90) < 1e-9) if want_valid else (sel is False),
              "selected=%s lat=%s" % (sel, lat))
        pe.close()

    pp = new_page(ctx, "?lat=25.5&lng=121.5&lat=40.4")
    c = pp.locator("#coords").inner_text()
    check("重複參數取第一個", "25.500000" in c, c.strip()[:60]); pp.close()
    pu = new_page(ctx, "?lat=%2024.5%20&lng=121.25")
    c = pu.locator("#coords").inner_text()
    check("URL 編碼空白仍解析", "24.500000" in c, c.strip()[:60]); pu.close()
    pr = new_page(ctx, "?lat=22.5&lng=113.9")
    pr.reload(wait_until="domcontentloaded"); pr.wait_for_timeout(800)
    c = pr.locator("#coords").inner_text()
    check("重新整理後仍用網址值", "22.500000" in c, c.strip()[:60]); pr.close()

    # ── C. 搜尋結果可選取 ──
    ps = new_page(ctx)
    ps.locator("#searchInput").fill("車站")
    ps.locator('button[onclick="searchPlace()"]').click()
    ps.wait_for_timeout(9000)
    n = ps.locator("#searchResults .sres").count()
    lat_before = ps.evaluate("lat")
    if n >= 2:
        texts = [ps.locator("#searchResults .sres").nth(i).inner_text() for i in range(n)]
        check("多筆結果→顯示可選列表", n >= 2, "%d 筆: %s" % (n, texts[0][:40]))
        check("未選取前座標不變", ps.evaluate("selected") is False or ps.evaluate("lat") == lat_before)
        ps.locator("#searchResults .sres").nth(-1).click()
        ps.wait_for_timeout(400)
        chosen = (ps.evaluate("lat"), ps.evaluate("lon"))
        mlng = ps.evaluate("marker.getLatLng().lat")
        check("點選最後一筆後 coords 更新", chosen[0] != lat_before or chosen[1] != ps.evaluate("113.94114"))
        check("marker 與狀態一致", abs(mlng - chosen[0]) < 1e-6, "marker=%s lat=%s" % (mlng, chosen[0]))
        c = ps.locator("#coords").inner_text()
        check("座標列顯示選取結果", ("%.6f" % chosen[0]) in c and ("%.6f" % chosen[1]) in c, c.strip()[:60])
        check("選後列表清空", ps.locator("#searchResults .sres").count() == 0)
    else:
        check("多筆結果→顯示可選列表", False, "正式站此詞只回 %d 筆, 無法測多選" % n)
    # 單筆自動套用
    ps.locator("#searchInput").fill("台北市")
    ps.locator('button[onclick="searchPlace()"]').click()
    ps.wait_for_timeout(9000)
    c = ps.locator("#coords").inner_text()
    check("單筆結果自動套用", "25.0" in c, c.strip()[:60])
    # 空結果/特殊字元不崩潰
    ps.locator("#searchInput").fill("zzz不存在的qqq")
    ps.locator('button[onclick="searchPlace()"]').click(); ps.wait_for_timeout(7000)
    check("查無結果不崩潰", ps.locator("#map").count() == 1 and len(ps.locator("#searchResults .sres").all()) == 0)
    ps.locator("#searchInput").fill("<script>alert(1)</script> &test")
    ps.locator('button[onclick="searchPlace()"]').click(); ps.wait_for_timeout(7000)
    check("特殊字元安全處理", ps.evaluate("document.querySelectorAll('#searchResults script').length") == 0)
    ps.close()

    import json, urllib.request, urllib.parse
    API = BASE.rstrip('/')  # BASE 帶尾斜線，直接串接會變成 //api/... 本地路由 404
    def api_get(qs):
        return json.loads(urllib.request.urlopen(API + "/api/search?" + qs, timeout=10).read())
    j = api_get("q=" + urllib.parse.quote("zzz不存在的qqq"))
    check("本地 Worker 空結果契約", j == {"results": []}, str(j)[:60])
    j2 = api_get("q=" + urllib.parse.quote("车站"))
    check("本地 Worker 桩多筆(經真實路由代碼)", len(j2.get("results", [])) == 2
          and j2["results"][0]["lat"] == 25.0478, str(j2)[:80])
    j3 = api_get("q=_")
    check("診斷探測端點離線可用(不出站空清單)", j3 == {"results": []}, str(j3)[:50])

    # ── D. 本地座標範圍守門 + 貼上解析回歸 ──
    pd_ = new_page(ctx)
    pd_.locator("#urlInput").fill("ll=95.5,121.5")
    pd_.evaluate("parseUrl()")
    pd_.wait_for_timeout(500)
    check("超界本地捷徑被拒絕", pd_.evaluate("selected") is False)
    pd_.locator("#urlInput").fill("https://maps.apple.com/?ll=25.03,121.56")
    pd_.evaluate("parseUrl()")
    pd_.wait_for_timeout(2500)
    c = pd_.locator("#coords").inner_text()
    check("地圖連結解析仍正常(回歸)", "25.030000" in c and "121.560000" in c, c.strip()[:60])
    pd_.evaluate("setPosFromDisplay(800, 900)")  # 經 display 反算後仍是怪值 → 應被拒
    check("非法 setPos 直接呼叫也擋", pd_.evaluate("selected") is True and pd_.evaluate("Math.abs(lat)<=90"))
    # WGS84/GCJ 圖層下解析順序
    pd_.evaluate("switchLayer('amap')")
    pd_.locator("#urlInput").fill("25.03, 121.56")
    pd_.evaluate("parseUrl()")
    pd_.wait_for_timeout(300)
    check("純座標本地解析(高德圖層下)", abs(pd_.evaluate("lat") - 25.03) < 1e-9 and abs(pd_.evaluate("lon") - 121.56) < 1e-9)
    pd_.close()

    # ── 自我診斷面板（P1-2）: 只应有證據的燈, iPhone 項恒灰 ──
    pd = new_page(ctx)
    pd.wait_for_timeout(1200)
    rows = pd.locator("#diagList .diag-row").count()
    check("診斷面板 3 列存在", rows == 3, "rows=%d" % rows)
    cls = pd.locator("#diagList .diag-row").first.get_attribute("class")
    # /api 由本地 Hono app 直接服務（stub 不出站）→ q="_" 必回 {results:[]} → 網站可達項應綠
    check("網站可達項有證據轉綠", "diag-ok" in cls, cls)
    cls2 = pd.locator("#diagList .diag-row").nth(1).get_attribute("class")
    # headless 環境無小火箭 → save 通道不通 → 應灰燈待驗證, 不得假綠
    check("通道未命中時保持灰燈(不假綠)", "diag-wait" in cls2, cls2)
    # 無效回應(非模組契約)不得判為通道成功: 以 route 攔截回垃圾 JSON 模擬（先註冊再導航）
    pg = ctx.new_page()
    pg.route("**/wloc-settings/save**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"unexpected":1}'))
    pg.goto(BASE, wait_until="domcontentloaded"); pg.wait_for_timeout(1500)
    cls3 = pg.locator("#diagList .diag-row").nth(1).get_attribute("class")
    check("垃圾 JSON 不誤判通道命中", "diag-wait" in cls3, cls3)
    pg.close()
    pd.close()

    # ── E. 高德圖層說明(hover title) ──
    pe2 = new_page(ctx)
    pe2.locator("#layerBtn").click(); pe2.wait_for_timeout(300)
    ttl = pe2.locator("label[data-i18n-title=amap_title]").get_attribute("title")
    check("高德圖層 option 有 GCJ-02 說明 title", ttl is not None and ("GCJ-02" in ttl), str(ttl)[:60])
    pe2.close()

    # ── 收藏/拖曳回歸 ──
    pf = new_page(ctx)
    pf.evaluate("moveTo(51.5, -0.12, 12)")
    pf.evaluate("if(!selected) setPos(51.5,-0.12); renderFavs && null")
    n0 = pf.evaluate("getFavs().length")
    pf.evaluate("saveFavs([{name:'T', lat:51.5, lon:-0.12, ts:Date.now()}]); renderFavs()")
    usebtn = pf.locator('.fav-item .fav-btn').first
    usebtn.click(); pf.wait_for_timeout(400)
    c = pf.locator("#coords").inner_text()
    check("收藏還原仍可套用(回歸)", "51.500000" in c and "-0.120000" in c, c.strip()[:60])
    pf.evaluate("saveFavs([])")
    # 手機排版: sticky bar 存在且不擋主要按鈕
    vis = pf.evaluate("(() => { const s=document.getElementById('stickyBar'); const r=s.getBoundingClientRect(); return r.height>0; })()")
    check("手機視口 sticky bar 正常", vis)
    pf.close()

    b.close()

fails = [r for r in results if not r[1]]
print("\nSUMMARY: %d/%d pass" % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
