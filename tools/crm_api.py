# CRM yazma backend'i — ERP önyüzü → CANLI Google Sheet (CRM v4).
# Yerel araç: `python tools/crm_api.py` → http://127.0.0.1:5001
# Kimlik: D:\Aquatronic\credentials.json (tarayıcıya ASLA gitmez).
#
# Sheet yapısı (crm_session_state.md): Pipeline veri R3'ten, 16 kolon (A..P);
# Activity Log veri R4'ten, yeni satır row=4'e insert; ID kolon A.
#
# UYARI: canlı üretim CRM'ine yazar. Endpoint'ler:
#   GET  /api/health           → {ok}
#   GET  /api/crm              → tam snapshot (pipeline/completed/lost/log/lists)
#   POST /api/crm/deal         → yeni fırsat (Pipeline'a ekle) + opsiyonel log
#   PUT  /api/crm/deal/<id>    → mevcut fırsatı ID ile bul, güncelle
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
from flask import Flask, request, jsonify
from flask_cors import CORS
import gspread

SHEET_ID = "1CAVbgIChrRJNITqAFMk7ZIeqHXG7Kti12V8rpSttWjY"
CREDS = r"D:\Aquatronic\credentials.json"

PIPE_COLS = ["id", "company", "project", "country", "contact", "email", "product", "owner",
             "stage", "dealValue", "paidValue", "shipping", "lastContact", "nextAction", "nextDate", "latest"]
LOG_COLS = ["date", "dealId", "company", "contact", "direction", "channel", "summary", "by"]

app = Flask(__name__)
CORS(app)  # yerel geliştirme: tüm origin'lere izin

_gc = None
def sheet():
    global _gc
    if _gc is None:
        _gc = gspread.service_account(filename=CREDS)
    return _gc.open_by_key(SHEET_ID)


def rows_to_dicts(rows, cols):
    out = []
    for r in rows:
        if not any((c or "").strip() for c in r):
            continue
        r = (list(r) + [""] * len(cols))[:len(cols)]
        out.append(dict(zip(cols, [(c or "").strip() for c in r])))
    return out


def read_snapshot():
    sh = sheet()
    pipeline = rows_to_dicts(sh.worksheet("Pipeline").get("A3:P200"), PIPE_COLS)
    completed = rows_to_dicts(sh.worksheet("Completed").get("A2:P100"), PIPE_COLS)
    lost = rows_to_dicts(sh.worksheet("Lost - Rejected").get("A2:P100"), PIPE_COLS)
    log = rows_to_dicts(sh.worksheet("Activity Log").get("A4:H400"), LOG_COLS)
    lw = sh.worksheet("Lists").get("A1:F50")
    hdr = lw[0]
    lists = {h: [row[i].strip() for row in lw[1:] if i < len(row) and row[i].strip()]
             for i, h in enumerate(hdr) if h.strip()}
    return {"pipeline": pipeline, "completed": completed, "lost": lost,
            "activityLog": log, "lists": lists}


def deal_to_row(d):
    return [d.get(c, "") or "" for c in PIPE_COLS]


def find_pipeline_row(ws, deal_id):
    # A3'ten itibaren ID eşleşen satırı bul (1-tabanlı satır no)
    col = ws.get("A3:A200")
    for i, cell in enumerate(col):
        if cell and cell[0].strip() == deal_id:
            return 3 + i
    return None


def first_empty_pipeline_row(ws):
    # A sütununda R3'ten sonraki ilk boş satır
    col = ws.get("A1:A400")
    r = 3
    for i in range(2, len(col)):          # index 2 == satır 3
        if col[i] and (col[i][0] or "").strip():
            r = i + 2                       # bu satır dolu → sonrası
        else:
            return i + 1
    return r + 1


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/crm")
def get_crm():
    try:
        return jsonify({"ok": True, "fetchedAt": "live", **read_snapshot()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/crm/deal")
def add_deal():
    d = request.get_json(force=True) or {}
    if not d.get("id") or not d.get("company"):
        return jsonify({"ok": False, "error": "id ve company zorunlu"}), 400
    try:
        sh = sheet()
        ws = sh.worksheet("Pipeline")
        if find_pipeline_row(ws, d["id"]):
            return jsonify({"ok": False, "error": f"ID zaten var: {d['id']}"}), 409
        row = first_empty_pipeline_row(ws)
        ws.update(f"A{row}:P{row}", [deal_to_row(d)], value_input_option="USER_ENTERED")
        # Opsiyonel: açılış aktivite kaydı
        if d.get("logSummary"):
            log = sh.worksheet("Activity Log")
            log.insert_row([d.get("lastContact", ""), d["id"], d.get("company", ""),
                            d.get("contact", ""), "Outbound", "ERP", d["logSummary"], d.get("owner", "")],
                           index=4, value_input_option="USER_ENTERED")
        return jsonify({"ok": True, "row": row, "deal": {c: d.get(c, "") for c in PIPE_COLS}})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.put("/api/crm/deal/<deal_id>")
def update_deal(deal_id):
    d = request.get_json(force=True) or {}
    try:
        sh = sheet()
        ws = sh.worksheet("Pipeline")
        row = find_pipeline_row(ws, deal_id)
        if not row:
            return jsonify({"ok": False, "error": f"ID bulunamadı: {deal_id}"}), 404
        current = ws.get(f"A{row}:P{row}")
        current = (current[0] if current else []) + [""] * len(PIPE_COLS)
        merged = dict(zip(PIPE_COLS, current))
        merged["id"] = deal_id
        for k, v in d.items():
            if k in PIPE_COLS:
                merged[k] = v
        ws.update(f"A{row}:P{row}", [deal_to_row(merged)], value_input_option="USER_ENTERED")
        return jsonify({"ok": True, "row": row, "deal": merged})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/crm/log")
def add_log():
    d = request.get_json(force=True) or {}
    if not d.get("dealId") or not d.get("summary"):
        return jsonify({"ok": False, "error": "dealId ve summary zorunlu"}), 400
    try:
        sh = sheet()
        ws = sh.worksheet("Pipeline")
        row = find_pipeline_row(ws, d["dealId"])
        company, contact = d.get("company", ""), d.get("contact", "")
        if row:
            vals = (ws.get(f"B{row}:E{row}") or [[]])[0] + [""] * 4
            company, contact = company or vals[0], contact or vals[3]
        sh.worksheet("Activity Log").insert_row(
            [d.get("date", ""), d["dealId"], company, contact,
             d.get("direction", "Outbound"), d.get("channel", "ERP"),
             d["summary"], d.get("by", "")],
            index=4, value_input_option="USER_ENTERED")
        # Sheet iş akışı: son temas = Latest punchline + Last Contact tarihi
        if d.get("updateLatest") and row:
            ws.update(f"M{row}", [[d.get("date", "")]], value_input_option="USER_ENTERED")
            ws.update(f"P{row}", [[d["summary"]]], value_input_option="USER_ENTERED")
        return jsonify({"ok": True, "pipelineRow": row})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# Test yardımcı: bir satırın değerlerini ID ile temizle (kontrollü doğrulama içindir).
# delete_rows KULLANMAZ — canlı sheet'te satır silmek biçim aralıklarını kaydırır.
@app.delete("/api/crm/deal/<deal_id>")
def delete_deal(deal_id):
    try:
        ws = sheet().worksheet("Pipeline")
        row = find_pipeline_row(ws, deal_id)
        if not row:
            return jsonify({"ok": False, "error": "bulunamadı"}), 404
        ws.batch_clear([f"A{row}:P{row}"])
        return jsonify({"ok": True, "clearedRow": row})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("CRM API → http://127.0.0.1:5001  (canlı Sheet'e yazar)")
    app.run(host="127.0.0.1", port=5001, debug=False)
