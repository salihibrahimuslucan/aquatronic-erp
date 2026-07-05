# CDP ekran görüntüsü aracı — async render'lı sayfalar için (headless --screenshot
# load olayında çeker, canlı fetch bekleyen görünümler boş çıkar; bu araç DOM'da
# seçici belirene kadar bekler).
# Kullanım: python tools/screenshot.py <url> <çıktı.png> [bekleme-seçicisi] [genişlik] [yükseklik]
import base64, json, os, subprocess, sys, time, urllib.request
import websocket

url = sys.argv[1]
out = sys.argv[2]
wait_sel = sys.argv[3] if len(sys.argv) > 3 else ".view-pane > *"
width = int(sys.argv[4]) if len(sys.argv) > 4 else 1600
height = int(sys.argv[5]) if len(sys.argv) > 5 else 1000

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9333

profile = os.path.join(os.environ.get("TEMP", "."), "cdp-shot")
proc = subprocess.Popen([
    CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
    "--remote-allow-origins=*",
    f"--window-size={width},{height}", f"--user-data-dir={profile}", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    page = None
    for _ in range(100):
        try:
            tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
            page = next(t for t in tabs if t["type"] == "page")
            break
        except Exception:
            time.sleep(0.3)
    if page is None:
        raise RuntimeError("Chrome DevTools'a bağlanılamadı (port 9333)")
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30)
    mid = [0]
    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid[0]:
                return msg.get("result", {})
    cmd("Emulation.setDeviceMetricsOverride", width=width, height=height,
        deviceScaleFactor=1, mobile=False)
    cmd("Page.enable")
    cmd("Page.navigate", url=url)
    # Seçici görünene kadar bekle (maks 25 sn)
    expr = f"!!document.querySelector({json.dumps(wait_sel)})"
    for _ in range(125):
        r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        if r.get("result", {}).get("value"):
            break
        time.sleep(0.2)
    time.sleep(0.6)  # foto/ikon boyaması için küçük pay
    shot = cmd("Page.captureScreenshot", format="png")
    with open(out, "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print(f"OK -> {out}")
finally:
    proc.kill()
