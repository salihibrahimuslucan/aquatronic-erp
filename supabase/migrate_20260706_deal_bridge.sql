-- 2026-07-06: Faz 2 köprüsü — CRM fırsatı → üretim emri bağı.
-- Canlıya tek sefer: python tools/run_sql.py supabase/migrate_20260706_deal_bridge.sql
-- (schema.sql yeni kurulumlar için ayrıca güncellendi.)

-- production_orders'a CRM deal referansı (opak ID — müşteri verisi değil).
alter table production_orders add column if not exists source_deal_id text not null default '';
create index if not exists production_orders_deal_idx
    on production_orders (source_deal_id) where source_deal_id <> '';

-- Fırsattan PLANLI üretim emri açar. security definer: CRM yetkilisi (yönetici/
-- satış) üretim-yazma iznine sahip olmasa bile kendi kazandığı fırsattan emir
-- açabilir. Emir 'planned' başlar; üretim ekibi "Üretime Al" ile aktive eder.
create or replace function create_order_from_deal(
    p_deal_id text, p_item_id bigint, p_product_name text,
    p_qty integer, p_note text default '', p_user text default ''
) returns production_orders language plpgsql security definer set search_path = public as $$
declare v_ord production_orders;
begin
    if current_role_of() not in ('yonetici', 'satis') then
        raise exception 'yetkisiz: fırsattan emri yalnız yönetici/satış açar';
    end if;
    if p_qty is null or p_qty <= 0 then raise exception 'adet 0''dan büyük olmalı'; end if;
    insert into production_orders
        (item_id, product_name, qty, status, cat, note, source_deal_id, user_name)
    values (p_item_id, p_product_name, p_qty, 'planned', 'CRM', p_note, p_deal_id, p_user)
    returning * into v_ord;
    return v_ord;
end $$;
