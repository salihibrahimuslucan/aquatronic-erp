# CRM v4 canli Google Sheet'ten READ-ONLY anlik goruntu -> src/data/crm-snapshot.json
# Kaynak yapisi: D:\Aquatronic\crm_session_state.md (Pipeline 16 kolon R3+, Log R4+, Lists)
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import gspread

SHEET_ID = "1CAVbgIChrRJNITqAFMk7ZIeqHXG7Kti12V8rpSttWjY"
CREDS = r"D:\Aquatronic\credentials.json"
OUT = r"D:\Aquatronic\erp\src\data\crm-snapshot.json"

PIPE_COLS = ["id","company","project","country","contact","email","product","owner",
             "stage","dealValue","paidValue","shipping","lastContact","nextAction","nextDate","latest"]
LOG_COLS = ["date","dealId","company","contact","direction","channel","summary","by"]

gc = gspread.service_account(filename=CREDS)
sh = gc.open_by_key(SHEET_ID)

def rows_to_dicts(rows, cols):
    out = []
    for r in rows:
        if not any(c.strip() for c in r):
            continue
        r = (r + [""] * len(cols))[:len(cols)]
        out.append(dict(zip(cols, [c.strip() for c in r])))
    return out

pipeline = rows_to_dicts(sh.worksheet("Pipeline").get("A3:P200"), PIPE_COLS)
completed = rows_to_dicts(sh.worksheet("Completed").get("A2:P100"), PIPE_COLS)
lost = rows_to_dicts(sh.worksheet("Lost - Rejected").get("A2:P100"), PIPE_COLS)
log = rows_to_dicts(sh.worksheet("Activity Log").get("A4:H400"), LOG_COLS)

lists_ws = sh.worksheet("Lists").get("A1:F50")
hdr = lists_ws[0]
lists = {h: [row[i].strip() for row in lists_ws[1:] if i < len(row) and row[i].strip()]
         for i, h in enumerate(hdr) if h.strip()}

snap = {"fetchedAt": "2026-07-05", "pipeline": pipeline, "completed": completed,
        "lost": lost, "activityLog": log, "lists": lists}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(snap, f, ensure_ascii=False, indent=1)
print(f"pipeline={len(pipeline)} completed={len(completed)} lost={len(lost)} log={len(log)} lists={list(lists.keys())}")
