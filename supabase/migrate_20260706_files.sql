-- 2026-07-06: Planlı üretim PDF eki + site içi dosya yükleme (foto/pdf).
-- Canlı DB'ye tek sefer uygulanır: python tools/run_sql.py supabase/migrate_20260706_files.sql
-- (schema.sql yeni kurulumlar için ayrıca güncellendi.)

alter table production_orders add column if not exists pdf_path text not null default '';

-- Storage: tek kova 'erp-files' — public okuma (URL ile), yazma yalnız girişli kullanıcı.
-- Klasörler: plans/ (üretim PDF'leri) · items/ (ürün fotoğrafları)
insert into storage.buckets (id, name, public)
values ('erp-files', 'erp-files', true)
on conflict (id) do update set public = true;

drop policy if exists erp_files_select on storage.objects;
drop policy if exists erp_files_insert on storage.objects;
drop policy if exists erp_files_update on storage.objects;
drop policy if exists erp_files_delete on storage.objects;
-- SELECT şart: storage API yükleme öncesi varlık kontrolü/upsert için okur
create policy erp_files_select on storage.objects for select to authenticated
    using (bucket_id = 'erp-files');
create policy erp_files_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'erp-files');
create policy erp_files_update on storage.objects for update to authenticated
    using (bucket_id = 'erp-files') with check (bucket_id = 'erp-files');
create policy erp_files_delete on storage.objects for delete to authenticated
    using (bucket_id = 'erp-files');
