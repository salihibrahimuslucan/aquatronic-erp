# CDP smoke testi — her hash rotasını gez, render + console hatası kontrol et.
# Kullanım: python tools/smoke.py [base_url]
import json, os, subprocess, sys, time, urllib.request
import websocket

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
ROUTES = [
    ("Aktif Üretim", "/g/active"),
    ("Planlı Üretim", "/g/planned"),
    ("Bitmiş Ürünler", "/g/finished"),
    ("Üretim", "/g/production"),
    ("Kablo & Soket", "/g/cable"),
    ("Pano / PSU", "/g/pano"),
    ("Elektronik (PCB)", "/g/elektronik"),
    ("Motor", "/g/motor"),
    ("Dış Üretim", "/g/dis"),
    ("Havuz Testi", "/g/pool"),
    ("Satın Alma", "/satinalma"),
    ("Cari Kartotek", "/cari"),
    ("Hareket Defteri", "/defter"),
    ("Raporlar", "/raporlar"),
    ("CRM Pipeline", "/crm"),
    ("CRM Log", "/crm/log"),
]
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9335
profile = os.path.join(os.environ.get("TEMP", "."), "cdp-smoke")
proc = subprocess.Popen([
    CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
    "--remote-allow-origins=*", "--window-size=1600,1000",
    f"--user-data-dir={profile}", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

errors = []   # (route, text)
def on_console(msg):
    p = msg.get("params", {})
    if p.get("type") == "error":
        txt = " ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", []))
        errors.append(txt)
def on_exc(msg):
    d = msg.get("params", {}).get("exceptionDetails", {})
    errors.append(d.get("exception", {}).get("description") or d.get("text", "exception"))

try:
    page = None
    for _ in range(100):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
            page = next(t for t in tabs if t["type"] == "page"); break
        except Exception:
            time.sleep(0.3)
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30)
    mid = [0]
    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
        while True:
            msg = json.loads(ws.recv())
            m = msg.get("method")
            if m == "Runtime.consoleAPICalled": on_console(msg)
            elif m == "Runtime.exceptionThrown": on_exc(msg)
            if msg.get("id") == mid[0]:
                return msg.get("result", {})
    def ev(expr):
        r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        return r.get("result", {}).get("value")
    def drain(sec=0.4):
        end = time.time() + sec
        ws.settimeout(0.2)
        while time.time() < end:
            try:
                msg = json.loads(ws.recv())
                m = msg.get("method")
                if m == "Runtime.consoleAPICalled": on_console(msg)
                elif m == "Runtime.exceptionThrown": on_exc(msg)
            except Exception:
                pass
        ws.settimeout(30)

    cmd("Page.enable"); cmd("Runtime.enable")
    cmd("Page.navigate", url=BASE + "/")
    for _ in range(100):
        if ev("!!document.getElementById('view-root')"): break
        time.sleep(0.2)
    time.sleep(1.0); drain(0.6)

    print(f"{'ROTA':<22} {'RENDER':<8} {'HATA'}")
    print("-" * 50)
    fails = 0
    for name, hash_ in ROUTES:
        errors.clear()
        ev(f"location.hash = {json.dumps('#'+hash_)}")
        ok = False
        for _ in range(60):
            if ev("!!document.querySelector('.view-pane > *')"): ok = True; break
            time.sleep(0.1)
        drain(0.5)
        # başlık boş değil mi
        title = ev("document.getElementById('page-title-text')?.textContent") or ""
        errtxt = errors[0][:60] if errors else ""
        status = "OK" if (ok and not errors) else ("BOŞ" if not ok else "HATA")
        if status != "OK": fails += 1
        print(f"{name:<22} {status:<8} {errtxt}")
    print("-" * 50)
    print(f"SONUÇ: {len(ROUTES)-fails}/{len(ROUTES)} rota temiz" + (" — HEPSİ GEÇTİ ✓" if fails == 0 else f" — {fails} SORUN"))
finally:
    proc.kill()
