-- ─────────────────────────────────────────────────────────────────────────
-- CRM şeması (Faz 1 — CRM buluta taşınıyor).
-- Amaç: müşteri/fiyat verisi ARTIK statik pakete gömülmez; giriş sonrası RLS
-- ile çekilir. Üretim rolü CRM'in TEK satırını bile göremez (RLS default-deny).
-- Yalnız yönetici + satış okur/yazar. Sütun düzeni Sheets v4 (PIPE_COLS/LOG_COLS)
-- ile birebir. current_role_of() ve profiles schema.sql'de tanımlı (önce o kurulur).
-- ─────────────────────────────────────────────────────────────────────────

-- Fırsatlar (Pipeline / Completed / Lost tek tabloda, bucket ile ayrılır)
create table if not exists crm_deals (
    id           text primary key,                 -- UI üretir (ör. UUS-1)
    bucket       text not null default 'pipeline'
                 check (bucket in ('pipeline', 'completed', 'lost')),
    company      text not null,
    project      text default '',
    country      text default '',
    contact      text default '',
    email        text default '',
    product      text default '',
    owner        text default '',
    stage        text default '',
    deal_value   text default '',                  -- serbest metin (Sheets birebir: '', '€5000'...)
    paid_value   text default '',
    shipping     text default '',
    last_contact text default '',                  -- 'dd.mm.yyyy' | ''
    next_action  text default '',
    next_date    text default '',                  -- 'dd.mm.yyyy' | ''
    latest       text default '',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- Aktivite günlüğü (deal timeline)
create table if not exists crm_activities (
    id         bigint generated always as identity primary key,
    deal_id    text references crm_deals(id) on delete cascade,
    date       text default '',                    -- 'dd.mm.yyyy'
    company    text default '',
    contact    text default '',
    direction  text default '',                    -- Inbound | Outbound
    channel    text default '',
    summary    text default '',
    by_who     text default '',                    -- Sheets 'by' kolonu
    created_at timestamptz not null default now()
);
create index if not exists crm_activities_deal_idx on crm_activities(deal_id);

-- Açılır liste değerleri (Stage / Source / Owner / Channel / Direction / Next Action)
create table if not exists crm_lists (
    kind     text not null,
    value    text not null,
    position int  not null default 0,
    primary key (kind, value)
);

-- updated_at otomatik
create or replace function crm_touch_updated() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists crm_deals_touch on crm_deals;
create trigger crm_deals_touch before update on crm_deals
    for each row execute function crm_touch_updated();

-- ─── RLS: yalnız yönetici + satış ──────────────────────────────────────────
alter table crm_deals      enable row level security;
alter table crm_activities enable row level security;
alter table crm_lists      enable row level security;

drop policy if exists crm_deals_rw on crm_deals;
create policy crm_deals_rw on crm_deals for all
    using (current_role_of() in ('yonetici', 'satis'))
    with check (current_role_of() in ('yonetici', 'satis'));

drop policy if exists crm_activities_rw on crm_activities;
create policy crm_activities_rw on crm_activities for all
    using (current_role_of() in ('yonetici', 'satis'))
    with check (current_role_of() in ('yonetici', 'satis'));

drop policy if exists crm_lists_rw on crm_lists;
create policy crm_lists_rw on crm_lists for all
    using (current_role_of() in ('yonetici', 'satis'))
    with check (current_role_of() in ('yonetici', 'satis'));
