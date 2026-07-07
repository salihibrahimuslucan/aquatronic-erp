# CDP giriş + ekran görüntüsü — canlı (login duvarlı) sayfalar için.
# Kullanım: python tools/shot_auth.py <url> <out.png> <email> <pass> [wait_sel] [w] [h]
import base64, json, os, subprocess, sys, time, urllib.request
import websocket

url, out, email, passwd = sys.argv[1:5]
wait_sel = sys.argv[5] if len(sys.argv) > 5 else ".view-pane > *"
width = int(sys.argv[6]) if len(sys.argv) > 6 else 1600
height = int(sys.argv[7]) if len(sys.argv) > 7 else 1150

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9334
profile = os.path.join(os.environ.get("TEMP", "."), "cdp-auth-shot")
proc = subprocess.Popen([
    CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
    "--remote-allow-origins=*", f"--window-size={width},{height}",
    f"--user-data-dir={profile}", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            if msg.get("id") == mid[0]:
                return msg.get("result", {})
    def ev(expr):
        return cmd("Runtime.evaluate", expression=expr, returnByValue=True).get("result", {}).get("value")

    cmd("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=False)
    cmd("Page.enable"); cmd("Runtime.enable")
    # Ana sayfaya git (login overlay'i bekle)
    base = url.split("#")[0]
    cmd("Page.navigate", url=base)
    for _ in range(100):
        if ev("!!document.getElementById('login-email') && !document.getElementById('login-overlay').hidden"):
            break
        time.sleep(0.2)
    # Kimlik doldur + Giriş Yap
    ev(f"(()=>{{const e=document.getElementById('login-email');e.value={json.dumps(email)};"
       f"e.dispatchEvent(new Event('input'));const p=document.getElementById('login-pass');"
       f"p.value={json.dumps(passwd)};p.dispatchEvent(new Event('input'));return true;}})()")
    ev("document.getElementById('login-go').click()")
    # Login overlay kapanana kadar bekle (maks 20 sn)
    for _ in range(100):
        if ev("!!document.getElementById('login-overlay') && document.getElementById('login-overlay').hidden"):
            break
        time.sleep(0.2)
    time.sleep(1.0)
    # Hedef hash rotasına git
    frag = url.split("#", 1)[1] if "#" in url else "/"
    ev(f"location.hash = {json.dumps('#'+frag)}")
    time.sleep(0.5)
    for _ in range(125):
        if ev(f"!!document.querySelector({json.dumps(wait_sel)})"):
            break
        time.sleep(0.2)
    time.sleep(0.8)
    # Kanıt için: aktif nav + görünen başlık + nav'da 'Raporlar' var mı
    diag = ev("JSON.stringify({title:document.getElementById('page-title-text')?.textContent,"
              "hasRaporNav:!!document.querySelector('[data-nav=\\\"raporlar\\\"]'),"
              "navItems:[...document.querySelectorAll('.nav-separator')].map(x=>x.textContent)})")
    print("DIAG:", diag)
    shot = cmd("Page.captureScreenshot", format="png")
    with open(out, "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print(f"OK -> {out}")
finally:
    proc.kill()
