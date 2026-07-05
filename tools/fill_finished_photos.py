"""
Eksik bitmis-urun fotograflarini yerel katalogdan doldurur.

Kaynak: D:\\Aquatronic\\product-dev\\companents\\ (Turkce isimli 98 gorsel)
Hedef : D:\\Aquatronic\\erp\\src\\data\\items.json (family=="finished", photo==None)

SADECE fotograf islemi yapar:
  1) items.json'daki eksik-fotoli bitmis urunleri bulur
  2) katalogda GUVENLI eslesme varsa dosyayi public/foto/<id>.<ext> olarak kopyalar
  3) items.json'da ilgili "photo" alanini "foto/<id>.<ext>" yapar

Zorlama eslesme YAPILMAZ. Katalogdaki gorseller byuk cogunlukla ic parca/komponent
fotograflari (PCB, conta, gövde, PSU vb.) - gercekten BITMIS urunu gosteren tek
dosya "config.png" (AquaCONFIG). Digerleri icin katalogda uygun foto YOK.
"""
import json
import shutil
import sys
from pathlib import Path

# Windows konsolu cp1254 olabilir - utf-8'e sar
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

ERP_ROOT = Path(r"D:\Aquatronic\erp")
ITEMS_JSON = ERP_ROOT / "src" / "data" / "items.json"
FOTO_DIR = ERP_ROOT / "public" / "foto"
CATALOG_ROOT = Path(r"D:\Aquatronic\product-dev\companents")

# Manuel dogrulanmis eslesmeler (id -> katalog dosyasi, ERP_ROOT'a gore relatif degil, mutlak yol)
# Sadece gercekten BITMIS urunu gosteren fotograflar icin eslestirme yapildi.
# Diger 12 kalem (PowerBOX 500, BlackBOX-3/6, AquaVARIABLE, AquaVARIABLE JUNIOR,
# Spin 2 5/6 nozzle, V:nano, DR1, DINA, Wind Sensor, Water Sensor) icin katalogda
# sadece ic parca/komponent fotograflari var (PCB, gövde, conta, PSU...) - bunlar
# yanlis/zorlama eslesme olacagindan BOS BIRAKILDI.
MATCHES = {
    26: CATALOG_ROOT / "config.png",  # AquaCONFIG - gercek bitmis urun fotosu
}


def main():
    items = json.loads(ITEMS_JSON.read_text(encoding="utf-8"))

    missing = [
        it for it in items
        if it.get("family") == "finished" and not it.get("photo")
    ]

    print("Eksik fotoli bitmis urunler:")
    for it in missing:
        print(f"  #{it['id']:<3} {it['name']:<25} tr={it.get('tr', '')}")
    print()

    copied = []
    unmatched = []

    for it in missing:
        item_id = it["id"]
        src = MATCHES.get(item_id)
        if src is None:
            unmatched.append(it)
            continue
        if not src.exists():
            print(f"UYARI: kaynak bulunamadi -> {src}")
            unmatched.append(it)
            continue

        ext = src.suffix.lower().lstrip(".")
        if ext == "jpeg":
            ext = "jpeg"  # kaynagin uzantisini oldugu gibi koru
        dest = FOTO_DIR / f"{item_id}.{ext}"

        if dest.exists():
            print(f"ATLANDI (zaten var): {dest}")
            continue

        shutil.copyfile(src, dest)
        it["photo"] = f"foto/{item_id}.{ext}"
        copied.append((item_id, it["name"], src.name, dest.name))
        print(f"KOPYALANDI: #{item_id} {it['name']} <- {src.name} -> {dest.name}")

    ITEMS_JSON.write_text(
        json.dumps(items, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print()
    print("=== OZET ===")
    print(f"Toplam kopyalanan dosya: {len(copied)}")
    if copied:
        print("Eslesenler:")
        for item_id, name, src_name, dest_name in copied:
            print(f"  #{item_id} {name} <- {src_name}")
    if unmatched:
        print("\nEslesMEYENler (katalogda uygun bitmis-urun fotosu yok):")
        for it in unmatched:
            print(f"  #{it['id']} {it['name']} (tr={it.get('tr', '')})")


if __name__ == "__main__":
    main()
