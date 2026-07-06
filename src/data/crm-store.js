// CRM veri katmanı — Supabase (Faz 1: CRM buluta taşındı).
// ÖNCE: veri hem pakete gömülü snapshot'tan hem yerel Flask API'sinden gelirdi.
// ARTIK: müşteri/fiyat verisi PAKETE GİRMEZ (crm-snapshot.json importu kaldırıldı);
// giriş sonrası Supabase'den RLS ile çekilir. Üretim rolü TEK satır bile göremez.
// Dış imzalar aynı kaldı → görünümler (views/crm.js, overview.js) değişmedi.
//
// Kalıcılık: crm_deals / crm_activities / crm_lists (bkz. supabase/crm_schema.sql).
// Sheets aynası (Salih'in vizyonu "işledikçe Sheets'e yansısın") artık ayrı bir
// senkron işi olacak (Supabase → Sheets); tarayıcı doğrudan Sheets'e yazamaz.

import { supabase, isCloud } from './supabase.js';
import { crmDeals as sampleCrmDeals } from './sample-data.js';

export function normalizeStage(stage) { return (stage ?? '').replace(/\s*\/\s*/g, ' / ').trim(); }
export function parseCrmDate(str) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((str ?? '').trim());
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}
export function parseCrmMoney(str) {
    const clean = (str ?? '').replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(clean);
    return clean && Number.isFinite(n) ? n : null;
}

// snake_case (DB) ↔ camelCase (UI) eşlemesi — Sheets v4 kolon düzeni korunur
const DEAL_TO_DB = {
    id: 'id', company: 'company', project: 'project', country: 'country', contact: 'contact',
    email: 'email', product: 'product', owner: 'owner', stage: 'stage', dealValue: 'deal_value',
    paidValue: 'paid_value', shipping: 'shipping', lastContact: 'last_contact',
    nextAction: 'next_action', nextDate: 'next_date', latest: 'latest', bucket: 'bucket',
};
function rowToDeal(r) {
    return {
        id: r.id, company: r.company, project: r.project, country: r.country, contact: r.contact,
        email: r.email, product: r.product, owner: r.owner, stage: normalizeStage(r.stage),
        dealValue: r.deal_value ?? '', paidValue: r.paid_value ?? '', shipping: r.shipping ?? '',
        lastContact: r.last_contact ?? '', nextAction: r.next_action ?? '', nextDate: r.next_date ?? '',
        latest: r.latest ?? '', source: r.bucket,
    };
}
function dealToRow(d) {
    const row = {};
    for (const [k, v] of Object.entries(d)) if (DEAL_TO_DB[k] !== undefined) row[DEAL_TO_DB[k]] = v;
    return row;
}
function rowToActivity(r) {
    return {
        date: r.date ?? '', dealId: r.deal_id ?? '', company: r.company ?? '', contact: r.contact ?? '',
        direction: r.direction ?? '', channel: r.channel ?? '', summary: r.summary ?? '', by: r.by_who ?? '',
    };
}
const EMPTY_LISTS = { Stage: [], Source: [], Owner: [], Channel: [], Direction: [], 'Next Action': [] };

let _crmCache = null;           // { data, live, at }
const CRM_TTL_MS = 30_000;      // 30 sn önbellek; yazmalar refreshCrm() çağırır
export function refreshCrm() { _crmCache = null; }
export function isCrmLive() { return isCloud(); }

function pgThrow(error) { if (error) throw new Error(error.message); }

export async function getCrm() {
    if (_crmCache && (Date.now() - _crmCache.at) < CRM_TTL_MS) return _crmCache.data;

    // Bulut yoksa (dev/localStorage) — SAHTE örnek veri; gerçek müşteri verisi pakette yok
    if (!isCloud()) {
        const data = {
            pipeline: sampleCrmDeals.map((d) => ({ ...d, stage: normalizeStage(d.stage), source: 'pipeline' })),
            completed: [], lost: [], activityLog: [], lists: EMPTY_LISTS, fetchedAt: null, live: false,
        };
        _crmCache = { data, live: false, at: Date.now() };
        return data;
    }

    const [dealsRes, actsRes, listsRes] = await Promise.all([
        supabase.from('crm_deals').select('*').order('id'),
        supabase.from('crm_activities').select('*').order('id', { ascending: false }),
        supabase.from('crm_lists').select('*').order('position'),
    ]);
    pgThrow(dealsRes.error); pgThrow(actsRes.error); pgThrow(listsRes.error);

    const deals = (dealsRes.data ?? []).map(rowToDeal);
    const lists = { ...EMPTY_LISTS };
    for (const r of listsRes.data ?? []) (lists[r.kind] ??= []).push(r.value);

    const data = {
        pipeline: deals.filter((d) => d.source === 'pipeline'),
        completed: deals.filter((d) => d.source === 'completed'),
        lost: deals.filter((d) => d.source === 'lost'),
        activityLog: (actsRes.data ?? []).map(rowToActivity),
        lists,
        fetchedAt: `bulut · ${new Date().toLocaleTimeString('tr-TR')}`,
        live: true,
    };
    _crmCache = { data, live: true, at: Date.now() };
    return data;
}

export async function crmAddDeal(deal) {
    if (!isCloud()) throw new Error('CRM bulut modunda değil');
    const row = dealToRow(deal);
    if (!row.id || !row.company) throw new Error('id ve company zorunlu');
    row.bucket = row.bucket || 'pipeline';
    const { error } = await supabase.from('crm_deals').insert(row);
    if (error) {
        if (/duplicate key|already exists|23505/i.test(error.message)) throw new Error(`ID zaten var: ${row.id}`);
        throw new Error(error.message);
    }
    // Opsiyonel açılış aktivitesi (add_deal paritesi)
    if (deal.logSummary) {
        await supabase.from('crm_activities').insert({
            deal_id: row.id, date: row.last_contact || '', company: row.company, contact: row.contact || '',
            direction: 'Outbound', channel: 'ERP', summary: deal.logSummary, by_who: row.owner || '',
        });
    }
    refreshCrm();
    return { ok: true };
}

export async function crmUpdateDeal(id, patch) {
    if (!isCloud()) throw new Error('CRM bulut modunda değil');
    const row = dealToRow(patch); delete row.id;
    const { error } = await supabase.from('crm_deals').update(row).eq('id', id);
    if (error) throw new Error(error.message);
    refreshCrm();
    return { ok: true };
}

export async function crmAddActivity(entry) {
    if (!isCloud()) throw new Error('CRM bulut modunda değil');
    if (!entry.dealId || !entry.summary) throw new Error('dealId ve summary zorunlu');
    const { error } = await supabase.from('crm_activities').insert({
        deal_id: entry.dealId, date: entry.date || '', company: entry.company || '', contact: entry.contact || '',
        direction: entry.direction || 'Outbound', channel: entry.channel || 'ERP',
        summary: entry.summary, by_who: entry.by || '',
    });
    if (error) throw new Error(error.message);
    // Sheet iş akışı paritesi: son temas = Latest punchline + Last Contact tarihi
    if (entry.updateLatest) {
        await supabase.from('crm_deals')
            .update({ last_contact: entry.date || '', latest: entry.summary })
            .eq('id', entry.dealId);
    }
    refreshCrm();
    return { ok: true };
}

export async function getDealById(id) {
    const crm = await getCrm();
    return [...crm.pipeline, ...crm.completed, ...crm.lost].find((d) => d.id === id) ?? null;
}
export async function getDealActivities(dealId) {
    const crm = await getCrm();
    return crm.activityLog
        .filter((a) => a.dealId === dealId)
        .sort((a, b) => (parseCrmDate(b.date)?.getTime() ?? 0) - (parseCrmDate(a.date)?.getTime() ?? 0));
}
export function isOverdue(dateStr) {
    const d = parseCrmDate(dateStr);
    if (!d) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today;
}

// Genel Bakış KPI'sı: açık fırsat sayısı. Üretim rolünde RLS boş döner → 0 (sızıntı yok).
export async function getOpenOpportunityCount() {
    try {
        const crm = await getCrm();
        return crm.pipeline.length;
    } catch { return 0; }
}
