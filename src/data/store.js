// Veri erişim katmanı — TEK giriş noktası.
// Faz 1'de bu modülün içi Supabase istemcisiyle değişecek; görünümler
// yalnızca buradaki async API'yi kullanır, veri kaynağını bilmez.
//
// Gerçek veri sözleşmesi (başka bir agent üretiyor):
//   src/data/items.json      -> [{id,name,family,cat,qty,critical,note,photo,boxQty,weight,tr,history,components}]
//   src/data/tabs.json       -> [{key,label,hidden,count}]
//   src/data/outsource.json  -> Ömer Kablo fason kayıtları (esnek alan adları)
//   src/data/ops.json        -> {pool, activityLog, productionArchive}
//
// Bu dosyalar henüz yoksa/eksikse sample-data.js üzerinden çalışmaya devam eder
// (geliştirme kesintisiz sürsün diye) — dosyalar gelince otomatik gerçek veriye geçilir.

import {
    items as sampleItems,
    moves as sampleMoves,
    productionOrders as sampleOrders,
    externalProduction as sampleExternal,
    crmDeals as sampleCrmDeals,
} from './sample-data.js';

// import.meta.glob: dosya yoksa derleme zamanında HATA vermez (Rollup sabit
// import path'lerini modül grafiğine zorunlu ekler, glob ise diskte ne varsa
// onu eşler) — bu yüzden veri dosyaları henüz üretilmemişken de build/dev
// kırılmaz, dosyalar gelince otomatik devreye girer.
const dataModules = import.meta.glob('./{items,tabs,outsource,ops,crm-snapshot}.json', { eager: true });

function loadJson(name) {
    const mod = dataModules[`./${name}.json`];
    return mod ? (mod.default ?? mod) : null;
}

const itemsJson = loadJson('items');
const tabsJson = loadJson('tabs');
const outsourceJson = loadJson('outsource');
const opsJson = loadJson('ops');

const STAGE_LABELS = {
    planli: 'Planlı',
    uretimde: 'Üretimde',
    havuz_testi: 'Havuz Testi',
    bitmis: 'Bitmiş',
};

export function stageLabel(stage) {
    return STAGE_LABELS[stage] ?? stage;
}

// --- Ürünler (items.json ↔ sample-data normalize) -------------------------

function normalizeItem(raw, idx) {
    // items.json şeması zaten bu alanlarla geliyorsa direkt kullan.
    if (itemsJson) {
        return {
            id: raw.id ?? idx,
            name: raw.name ?? '(isimsiz)',
            family: raw.family ?? raw.cat ?? 'Diğer',
            cat: raw.cat ?? raw.family ?? 'Diğer',
            qty: Number(raw.qty) || 0,
            critical: Number(raw.critical) || 0,
            note: raw.note ?? '',
            photo: raw.photo || null,
            boxQty: raw.boxQty ?? null,
            weight: raw.weight ?? null,
            tr: raw.tr ?? raw.name ?? '',
            history: Array.isArray(raw.history) ? raw.history : [],
            components: raw.components ?? null,
        };
    }
    // sample-data.js eski şeması (code/category/unit/updated) -> ortak şemaya çevir.
    return {
        id: idx,
        name: raw.name,
        family: raw.category,
        cat: raw.category,
        qty: Number(raw.qty) || 0,
        critical: Number(raw.critical) || 0,
        note: `Kod: ${raw.code} · Birim: ${raw.unit} · Son güncelleme: ${raw.updated}`,
        photo: null,
        boxQty: null,
        weight: null,
        tr: raw.name,
        history: sampleMoves
            .filter((m) => m.code === raw.code)
            .map((m) => ({
                date: m.date,
                type: m.type === 'giris' ? 'in' : 'out',
                qty: m.qty,
                user: 'Sistem',
                note: m.note,
            })),
        components: null,
    };
}

// Gizli sekmelerin kalemleri katalogda GÖRÜNMEZ (grid/arama/KPI dışı)
// ama veri durur — ID ile detayına ulaşılabilir (rawItems).
const _hiddenFamilies = new Set((tabsJson ?? []).filter((t) => t.hidden).map((t) => t.key));

let _rawCache = null;
function rawItems() {
    if (_rawCache) return _rawCache;
    const source = itemsJson ?? sampleItems;
    _rawCache = source.map((raw, idx) => normalizeItem(raw, idx));
    return _rawCache;
}

function allItems() {
    return rawItems().filter((i) => !_hiddenFamilies.has(i.family));
}

export function stockStatus(item) {
    if (item.qty <= item.critical) return 'critical';
    if (item.qty <= item.critical * 1.2) return 'low';
    return 'ok';
}

export function stockStatusLabel(status) {
    if (status === 'critical') return 'Kritik';
    if (status === 'low') return 'Azalıyor';
    return 'Yeterli';
}

export async function getItems() {
    return allItems();
}

export async function getItemById(id) {
    const numId = Number(id);
    return rawItems().find((i) => i.id === numId || String(i.id) === String(id)) ?? null;
}

// Bellek-içi stok güncelleme (Faz 1'de Supabase'e bağlanacak; kalıcılık YOK).
export async function adjustItemStock(id, delta, meta = {}) {
    const item = await getItemById(id);
    if (!item) return null;
    const before = item.qty;
    item.qty = Math.max(0, item.qty + delta);
    const diff = item.qty - before;
    if (diff !== 0) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('tr-TR') + ' ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        item.history.unshift({
            date: dateStr,
            type: diff > 0 ? 'in' : 'out',
            qty: Math.abs(diff),
            user: meta.user ?? 'Salih',
            note: meta.note ?? 'Manuel stok güncelleme',
        });
    }
    return item;
}

// --- Sekmeler (tabs.json) --------------------------------------------------

let _tabsCache = null;
export async function getTabs() {
    if (_tabsCache) return _tabsCache;
    if (tabsJson) {
        _tabsCache = tabsJson.filter((t) => !t.hidden);
        return _tabsCache;
    }
    // Fallback: item ailelerinden türet.
    const families = [...new Set(allItems().map((i) => i.family))].sort();
    _tabsCache = families.map((f) => ({
        key: f,
        label: f,
        hidden: false,
        count: allItems().filter((i) => i.family === f).length,
    }));
    return _tabsCache;
}

// --- Hareket defteri (ops.json activityLog ↔ sample moves) ----------------

function normalizeLogEntry(raw, idx) {
    if (opsJson?.activityLog) {
        return {
            id: raw.id ?? idx,
            date: raw.date ?? raw.time ?? raw.timestamp ?? '',
            product: raw.product ?? raw.item ?? raw.name ?? '—',
            action: raw.action ?? raw.type ?? raw.op ?? '—',
            qty: raw.qty ?? raw.amount ?? null,
            user: raw.user ?? raw.by ?? raw.responsible ?? 'Sistem',
            note: raw.note ?? raw.detail ?? '',
        };
    }
    return {
        id: raw.id ?? idx,
        date: raw.date,
        product: raw.name,
        action: raw.type === 'giris' ? 'Giriş' : 'Çıkış',
        qty: raw.qty,
        user: 'Sistem',
        note: raw.note ?? `Ref: ${raw.ref ?? ''}`,
    };
}

export async function getActivityLog() {
    const source = opsJson?.activityLog ?? sampleMoves;
    return source
        .map((raw, idx) => normalizeLogEntry(raw, idx))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// --- Üretim emirleri (ops.json productionArchive ↔ sample) ----------------

const REAL_PROJECTS = [];

let _ordersCache = null;
function seedOrdersFromSample() {
    return sampleOrders.map((o) => ({ ...o, pool: null, outsource: null }));
}

export async function getProductionOrders() {
    if (_ordersCache) return _ordersCache;
    if (opsJson?.productionArchive && opsJson.productionArchive.length > 0) {
        _ordersCache = opsJson.productionArchive.map((raw, idx) => ({
            id: raw.id ?? `ORD-${1000 + idx}`,
            product: raw.product ?? raw.item ?? '—',
            qty: Number(raw.qty) || 0,
            stage: raw.stage ?? 'planli',
            project: raw.project ?? REAL_PROJECTS[idx % REAL_PROJECTS.length],
            due: raw.due ?? raw.dueDate ?? '',
            note: raw.note ?? '',
            pool: raw.pool ?? null,
            outsource: raw.outsource ?? null,
        }));
    } else {
        _ordersCache = seedOrdersFromSample();
    }
    return _ordersCache;
}

export async function getProductionOrderById(id) {
    const orders = await getProductionOrders();
    return orders.find((o) => o.id === id) ?? null;
}

export async function setOrderStage(id, newStage) {
    const order = await getProductionOrderById(id);
    if (!order) return null;
    const oldStage = order.stage;
    order.stage = newStage;
    if (newStage === 'bitmis' && oldStage !== 'bitmis') {
        const item = allItems().find((i) => i.name === order.product);
        if (item) {
            item.qty += order.qty;
            const now = new Date();
            const dateStr = now.toLocaleDateString('tr-TR') + ' ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            item.history.unshift({
                date: dateStr,
                type: 'in',
                qty: order.qty,
                user: 'Üretim Sistemi',
                note: `Tamamlanan iş emri: ${order.id}`,
            });
        }
    }
    return order;
}

export async function savePoolMetrics(id, metrics) {
    const order = await getProductionOrderById(id);
    if (!order) return null;
    order.pool = { ...metrics };
    return order;
}

export async function saveOutsourceMetrics(id, details) {
    const order = await getProductionOrderById(id);
    if (!order) return null;
    order.outsource = { ...details };
    return order;
}

// Havuz testi örnek kalibrasyon verisi (ops.json pool varsa oradan, yoksa demo).
export async function getPoolSampleMetrics() {
    if (opsJson?.pool) {
        const p = Array.isArray(opsJson.pool) ? opsJson.pool[0] : opsJson.pool;
        if (p) return p;
    }
    return {
        pressure: '3.2 Bar',
        duration: '45 dk',
        current: '210mA / 840mA',
        height: '6.5m',
        notes: 'IP68 contası sıkıldı. Pompa mil balans testi başarılı.',
    };
}

// --- Fason (outsource.json ↔ sample externalProduction) -------------------

export async function getOutsourceJobs() {
    if (outsourceJson) return outsourceJson;
    return sampleExternal;
}

// --- CRM (Google Sheets CRM v4'ün birebir aynası; kaynak: crm-snapshot.json) --
// Sekmeler: Pipeline / Completed / Lost - Rejected. 16 kolon (A..P) + Activity Log (8 kolon) + Lists sözlükleri.

const crmJson = loadJson('crm-snapshot');

// Sheet'te "New/Inquiry" ve "New / Inquiry" karışık — kanonik forma indirger.
export function normalizeStage(stage) {
    return (stage ?? '').replace(/\s*\/\s*/g, ' / ').trim();
}

// "30.06.2026" (DD.MM.YYYY) -> Date | null
export function parseCrmDate(str) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((str ?? '').trim());
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

// Sheet tr-locale para stringi ("118.000") -> sayı | null
export function parseCrmMoney(str) {
    const clean = (str ?? '').replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
    if (!clean) return null;
    const n = Number(clean);
    return Number.isFinite(n) ? n : null;
}

function normalizeDeal(raw, source) {
    return { ...raw, stage: normalizeStage(raw.stage), source };
}

export async function getCrm() {
    if (!crmJson) {
        return {
            pipeline: sampleCrmDeals, completed: [], lost: [], activityLog: [],
            lists: { Stage: [], 'Next Action': [], Owner: [], Channel: [], Direction: [] },
        };
    }
    return {
        pipeline: crmJson.pipeline.map((d) => normalizeDeal(d, 'pipeline')),
        completed: crmJson.completed.map((d) => normalizeDeal(d, 'completed')),
        lost: crmJson.lost.map((d) => normalizeDeal(d, 'lost')),
        activityLog: crmJson.activityLog,
        lists: crmJson.lists,
        fetchedAt: crmJson.fetchedAt ?? null,
    };
}

export async function getDealById(id) {
    const crm = await getCrm();
    return [...crm.pipeline, ...crm.completed, ...crm.lost]
        .find((d) => d.id === id) ?? null;
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

// --- KPI'lar ----------------------------------------------------------------

export async function getKpis() {
    const items = allItems();
    const orders = await getProductionOrders();
    const crm = await getCrm();
    const critical = items.filter((i) => stockStatus(i) === 'critical');
    const openOrders = orders.filter((o) => o.stage !== 'bitmis');
    return {
        totalItems: items.length,
        criticalCount: critical.length,
        openOrderCount: openOrders.length,
        openOpportunityCount: crm.pipeline.length,
    };
}

export async function getCriticalItems() {
    return allItems()
        .filter((i) => stockStatus(i) !== 'ok')
        .sort((a, b) => (a.qty - a.critical) - (b.qty - b.critical));
}

export function formatMoney(value, currency = 'EUR') {
    if (!value) return '—';
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(value);
}

export function familyIcon(family) {
    const icons = {
        AquaLIGHT: '💡',
        AquaVARIO: '💧',
        AquaSWITCH: '⚙️',
        PowerBOX: '🔌',
        BlackBOX: '📦',
        Nozullar: '🌀',
        Nozzle: '🌀',
        Kablolar: '🔌',
        Cable: '🔌',
        PCB: '⚡',
        Sarf: '🛠️',
    };
    return icons[family] || '📦';
}
