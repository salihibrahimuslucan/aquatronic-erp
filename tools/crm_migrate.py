# CRM verisini Supabase'e taşır: crm_schema.sql kurar + crm-snapshot.json'u seed'ler.
# Idempotent: önce mevcut CRM satırlarını temizler, sonra snapshot'ı yükler.
# Kullanım: python tools/crm_migrate.py
import json, pathlib, sys
import psycopg

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
root = pathlib.Path(__file__).resolve().parent.parent

env = {}
for line in (root / ".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k.strip()] = v.strip()

snap = json.loads((root / "src" / "data" / "crm-snapshot.json").read_text(encoding="utf-8"))
schema_sql = (root / "supabase" / "crm_schema.sql").read_text(encoding="utf-8")

DEAL_COLS = ["id", "company", "project", "country", "contact", "email", "product", "owner",
             "stage", "dealValue", "paidValue", "shipping", "lastContact", "nextAction", "nextDate", "latest"]
SNAKE = {"dealValue": "deal_value", "paidValue": "paid_value", "lastContact": "last_contact",
         "nextAction": "next_action", "nextDate": "next_date"}

conn = psycopg.connect(env["SUPABASE_DB_URL"], connect_timeout=15)
with conn:
    with conn.cursor() as cur:
        print("crm_schema.sql kuruluyor...")
        cur.execute(schema_sql)

        # temizle (idempotent)
        cur.execute("delete from crm_activities")
        cur.execute("delete from crm_deals")
        cur.execute("delete from crm_lists")

        # fırsatlar
        db_cols = ["id", "bucket"] + [SNAKE.get(c, c) for c in DEAL_COLS if c != "id"]
        placeholders = ", ".join(["%s"] * len(db_cols))
        ins = f"insert into crm_deals ({', '.join(db_cols)}) values ({placeholders})"
        n_deals = 0
        for bucket in ("pipeline", "completed", "lost"):
            for d in snap.get(bucket, []):
                if not d.get("id") or not d.get("company"):
                    continue
                vals = [d["id"], bucket] + [(d.get(c, "") or "") for c in DEAL_COLS if c != "id"]
                cur.execute(ins, vals)
                n_deals += 1

        # aktiviteler (deal_id snapshot'ta olmayan log'ları atla — FK)
        valid_ids = {r[0] for r in cur.execute("select id from crm_deals").fetchall()}
        n_act = 0
        for a in snap.get("activityLog", []):
            did = a.get("dealId") or None
            if did and did not in valid_ids:
                did = None  # yetim log — deal_id boş bırak
            cur.execute(
                "insert into crm_activities (deal_id, date, company, contact, direction, channel, summary, by_who)"
                " values (%s,%s,%s,%s,%s,%s,%s,%s)",
                [did, a.get("date", ""), a.get("company", ""), a.get("contact", ""),
                 a.get("direction", ""), a.get("channel", ""), a.get("summary", ""), a.get("by", "")])
            n_act += 1

        # listeler
        n_list = 0
        for kind, vals in snap.get("lists", {}).items():
            for i, v in enumerate(vals or []):
                cur.execute("insert into crm_lists (kind, value, position) values (%s,%s,%s)"
                            " on conflict (kind, value) do nothing", [kind, v, i])
                n_list += 1

        print(f"  crm_deals: {n_deals}  crm_activities: {n_act}  crm_lists: {n_list}")
conn.close()
print("CRM MIGRASYON TAMAM")
