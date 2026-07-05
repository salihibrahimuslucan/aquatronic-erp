// CRM veri katmanı (Google Sheets v4 aynası) — SATIŞ tarafının TEK giriş noktası.
// Bu modül yalnız satış build'ine (@sales → sales-on.js) girer; build:uretim
// paketinde bu dosya da crm-snapshot.json da YER ALMAZ (müşteri/fiyat sızmaz).
//
// Yerel yazma API'si (tools/crm_api.py, port 5001) ayaktaysa canlı Sheet'ten
// okunur ve yazma açılır; değilse pakete gömülü snapshot'a düşülür (salt-okur).

import crmJson from './crm-snapshot.json';
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
function normalizeDeal(raw, source) { return { ...raw, stage: normalizeStage(raw.stage), source }; }

const CRM_API = 'http://127.0.0.1:5001';
let _crmCache = null;           // { data, live, at }
const CRM_TTL_MS = 60_000;      // canlı veriyi 60 sn önbellekle; yazmalar refreshCrm() çağırır

async function fetchLiveCrm() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(`${CRM_API}/api/crm`, { signal: ctrl.signal });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || 'CRM API hatası');
        return j;
    } finally { clearTimeout(t); }
}

export function refreshCrm() { _crmCache = null; }
export function isCrmLive() { return _crmCache?.live ?? false; }

function shapeCrm(raw, live) {
    return {
        pipeline: raw.pipeline.map((d) => normalizeDeal(d, 'pipeline')),
        completed: raw.completed.map((d) => normalizeDeal(d, 'completed')),
        lost: raw.lost.map((d) => normalizeDeal(d, 'lost')),
        activityLog: raw.activityLog,
        lists: raw.lists,
        fetchedAt: live ? `canlı · ${new Date().toLocaleTimeString('tr-TR')}` : (raw.fetchedAt ?? null),
        live,
    };
}

export async function getCrm() {
    if (_crmCache && (Date.now() - _crmCache.at) < CRM_TTL_MS) return _crmCache.data;
    let data;
    try {
        data = shapeCrm(await fetchLiveCrm(), true);
    } catch {
        if (!crmJson) {
            return { pipeline: sampleCrmDeals, completed: [], lost: [], activityLog: [],
                lists: { Stage: [], 'Next Action': [], Owner: [], Channel: [], Direction: [] }, live: false };
        }
        data = shapeCrm(crmJson, false);
    }
    _crmCache = { data, live: data.live, at: Date.now() };
    return data;
}

async function crmPost(method, path, body) {
    const res = await fetch(`${CRM_API}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    if (!j.ok) throw new Error(j.error || `HTTP ${res.status}`);
    refreshCrm();
    return j;
}

export async function crmAddDeal(deal) { return crmPost('POST', '/api/crm/deal', deal); }
export async function crmUpdateDeal(id, patch) {
    return crmPost('PUT', `/api/crm/deal/${encodeURIComponent(id)}`, patch);
}
export async function crmAddActivity(entry) { return crmPost('POST', '/api/crm/log', entry); }
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

// Genel Bakış KPI'sı: açık fırsat sayısı (canlı varsa canlı, yoksa snapshot).
export async function getOpenOpportunityCount() {
    const crm = await getCrm();
    return crm.pipeline.length;
}
