-- 2026-07-06: Komponent kaynağı köprüsü — her parça nereden temin edilir.
-- Canlıya: python tools/run_sql.py supabase/migrate_20260706_sourcing.sql
-- "Tedarik emri" DEĞİL — yalnız kaynak bilgisi: stok düşünce nereden gelir bellidir.

alter table items add column if not exists source_type text not null default '';
    -- '' (belirsiz) | inhouse (kendi üretim) | outsource (dış fason) | purchase (satın alma)
alter table items add column if not exists supplier   text not null default '';
alter table items add column if not exists source_note text not null default '';
    -- sipariş detayı / tedarik notu (marka, min. sipariş, teslim süresi vb.)
