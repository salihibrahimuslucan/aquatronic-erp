# Aquatronic ERP

Küçük bir üretim atölyesi için baştan yazılmış bir ERP: stok, üretim emirleri, BOM (ürün
reçetesi), CRM satış hattı, satın alma ve cari kartotek — tek sayfa uygulama, gerçek üretimde
kullanılıyor.

Mimariyi, veri modelini ve güvenlik sınırlarını (aşağıda) ben
belirledim,her fazı gerçek kullanıcı akışlarına karşı test edip
kanıtladım.

## Veri hakkında not

Bu depo gerçek bir işletmenin canlı sistemi olduğu için **git geçmişi dahil** gerçek stok, BOM,
tedarikçi ve CRM (müşteri/teklif/anlaşma) verisi public'e alınmadan önce tamamen temizlendi ve
aynı şemada uydurma örnek verilerle değiştirildi (`src/data/sample-data.js`, `bom-seed.json`,
`items.json`, `outsource.json`, `ops.json`). Gerçek ürün fotoğrafları ve BOM çıkarım
çıktıları da (git geçmişi dahil) depodan çıkarıldı. Kod ve mimari gerçek, veri değil.

## Ne yapıyor

- **Stok:** foto-öncelikli ürün kataloğu, kritik eşik takibi, sayım modu.
- **Üretim:** planlı → üretimde → havuz testi → bitmiş akışı; tamamlanınca BOM otomatik tüketilir
  ve stoğa geçer (tek atomik işlem, `complete_production_order` RPC).
- **CRM:** satış hattı (lead → teklif → müzakere → kazanıldı/kayıp), kazanılan fırsat tek tıkla
  üretim emrine bağlanır (`source_deal_id` köprüsü).
- **Satın alma:** kritik stoktan tedarikçi bazlı sipariş önerisi → sipariş → mal kabul.
- **Cari kartotek:** müşteri/tedarikçi kartları, satın alma ve CRM fırsatlarıyla ilişkili.
- **Roller:** yönetici / satış / üretim — CRM verisi (fiyat, iletişim) yalnızca yetkili rollere
  görünür; üretim rolü fırsat rozetini görür ama içeriğini göremez.

## Güvenlik mimarisi (öğrenilen dersler)

- **İki build hedefi:** `npm run build` (tam uygulama) vs `npm run build:uretim` — ikincisi
  satış modülünü (`crm.js`, `crm-store.js`) modül grafiğine hiç sokmaz, `build-uretim.mjs` ile
  paketten fiziksel olarak çıkarır. Üretim rolüne dağıtılan paket satış/fiyat kodunu **hiç
  içermez** — sadece "gizlenmiş" değil, bundle'da yok.
- **RLS (Row-Level Security):** her tablo Supabase RLS ile korunuyor; yetkisiz rol denemesi
  gerçek kullanıcı hesabıyla test edilip sıfır satır döndüğü doğrulandı.
- **Bu iki nokta, geliştirme sırasında bir kez yanlış yapılıp sonradan düzeltildi** — build
  hedefi ayrımı da RLS de ilk sürümde yoktu, gerçek bir veri sızıntısı riskinden sonra eklendi.

## Fazlar

- **Faz 0 — statik:** Vite + vanilla ES modules, localStorage.
- **Faz 1 — Supabase:** bulut store, giriş, roller, RLS.
- **Faz 2 — köprüler:** CRM fırsatı → üretim emri, seri no takibi, dosya/foto yönetimi.
- **Faz 3 (mevcut) — vitrin-tamlık:** cari kartotek, satın alma-lite, raporlar paneli, mobil UX.

## Çalıştırma

```bash
npm install
npm run dev            # yerel mod, sample-data.js ile (Supabase yapılandırılmadan)
npm run build           # tam paket
npm run build:uretim    # satış-kodsuz üretim paketi
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` tanımlanmazsa uygulama otomatik olarak yerel
JSON-tohum + localStorage moduna düşer — bu repo'yu klonlayıp `npm run dev` ile doğrudan
deneyebilirsiniz.
