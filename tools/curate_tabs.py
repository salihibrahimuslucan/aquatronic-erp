# Sekme kürasyonu (Salih, 2026-07-06):
# - 6 sekme UI'dan kaldirilir (hidden:true, VERI SILINMEZ): pcbcomp, vario, pcbcard, xhsocket, chemical, motor
# - "Kutular" ikiye ayrilir: ambalaj (box) vs elektronik muhafaza/buat (enclosure, PR/SE/RT serisi)
# - BlackBOX Cable (#128) powerbox -> cable
# - Etiket/sira duzeltmeleri; tasinan kalemlerde familyOrig saklanir (geri alinabilir)
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ITEMS = r"D:\Aquatronic\erp\src\data\items.json"
TABS = r"D:\Aquatronic\erp\src\data\tabs.json"

HIDE = {"pcbcomp", "vario", "pcbcard", "xhsocket", "chemical", "motor"}
# id -> yeni family
MOVES = {128: "cable"}
for _id in [486, 487, 488, 489, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499, 500]:
    MOVES[_id] = "enclosure"

items = json.load(open(ITEMS, encoding="utf-8"))
moved = []
for it in items:
    new_fam = MOVES.get(it["id"])
    if new_fam and it["family"] != new_fam:
        it["familyOrig"] = it["family"]
        it["family"] = new_fam
        moved.append(f"#{it['id']} {it['name']}: {it['familyOrig']} -> {new_fam}")

# Sekme tanimi: gorunur sira + etiketler
VISIBLE_ORDER = [
    ("finished", "Bitmiş Ürünler"),
    ("lighting", "Aydınlatma"),
    ("powerbox", "PowerBox"),
    ("switch", "Switch"),
    ("nozzle", "Nozullar"),
    ("cable", "Kablolar & Soketler"),
    ("box", "Ambalaj Kutuları"),
    ("enclosure", "Muhafaza & Buat"),
    ("pano", "Pano Malzemeleri"),
]
HIDDEN_LABELS = {
    "pcbcomp": "PCB Bileşenleri", "vario": "Vario Motorlar", "pcbcard": "PCB Kartları",
    "xhsocket": "XH Soket", "chemical": "Kimyasallar", "motor": "Motorlar",
}

counts = {}
for it in items:
    counts[it["family"]] = counts.get(it["family"], 0) + 1

tabs = [{"key": k, "label": lbl, "hidden": False, "count": counts.get(k, 0)}
        for k, lbl in VISIBLE_ORDER]
tabs += [{"key": k, "label": lbl, "hidden": True, "count": counts.get(k, 0)}
         for k, lbl in HIDDEN_LABELS.items()]

json.dump(items, open(ITEMS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(tabs, open(TABS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

visible_total = sum(t["count"] for t in tabs if not t["hidden"])
print(f"Tasinan {len(moved)} kalem:")
for m in moved:
    print("  " + m)
print(f"Gorunur sekme: {[(t['key'], t['count']) for t in tabs if not t['hidden']]}")
print(f"Gorunur kalem toplami: {visible_total} / {len(items)}")
