import json, sys, io
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

items = json.load(open(r"D:\Aquatronic\erp\src\data\items.json", encoding="utf-8"))
keep = ["finished", "powerbox", "lighting", "box", "cable", "pano", "nozzle", "switch"]
drop = ["pcbcomp", "vario", "pcbcard", "xhsocket", "chemical", "motor"]

g = defaultdict(list)
for i in items:
    g[i["family"]].append(i)

for f in keep:
    print(f"=== {f} ({len(g[f])}) ===")
    for i in g[f]:
        print(f"  #{i['id']} {i['name']} | qty {i['qty']} | cat {i.get('cat', '')}")

print()
for f in drop:
    print(f"=== KALDIRILACAK {f} ({len(g[f])}) — ilk 12 ===")
    for i in g[f][:12]:
        print(f"  #{i['id']} {i['name']} | qty {i['qty']} | cat {i.get('cat', '')}")
