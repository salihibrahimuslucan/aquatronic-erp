// Aquatronic ERP — herkese açık demo veri katmanı (SENTETİK).
// Gerçek ürün/müşteri/stok verisi bu depodan (git geçmişi dahil) temizlendi;
// burada yalnızca uygulamanın açılış/demo modunda çalışması için uydurma
// örnek veri var. Üretimde bu dosyanın yerini Supabase alır (bkz. store.js).

export const items = [
  { code: "DEMO-LGT-01", name: "DemoLIGHT 100",       category: "Lighting", unit: "adet", qty: 40, critical: 10, updated: "2026-01-01" },
  { code: "DEMO-SW-01",  name: "DemoSWITCH 100",       category: "Switch",   unit: "adet", qty: 12, critical: 5,  updated: "2026-01-01" },
  { code: "DEMO-VAR-01", name: "DemoVARIO 150",        category: "Vario",    unit: "adet", qty: 20, critical: 8,  updated: "2026-01-01" },
  { code: "DEMO-PB-01",  name: "DemoPowerBOX 500",     category: "PowerBox", unit: "adet", qty: 15, critical: 5,  updated: "2026-01-01" },
  { code: "DEMO-NOZ-01", name: "DemoNozzle Standard",  category: "Nozzle",   unit: "adet", qty: 60, critical: 20, updated: "2026-01-01" },
];

export const crmDeals = [
  { id: "DEMO-1", company: "Northwind Aquatics", country: "Fictionland", subject: "Demo splash-park nozzle package", stage: "teklif",    value: 25000, currency: "EUR", lastAction: "Sample offer sent",          date: "2026-01-05" },
  { id: "DEMO-2", company: "Bluewave Resorts",    country: "Testonia",    subject: "Demo VFD cabinet + controls",     stage: "muzakere",  value: 60000, currency: "EUR", lastAction: "Sample BOM revision",        date: "2026-01-10" },
  { id: "DEMO-3", company: "Sunspray Municipal",  country: "Exampland",   subject: "Demo multi-cabin automation",     stage: "kazanildi", value: 90000, currency: "EUR", lastAction: "Sample production started", date: "2026-01-15" },
];
