// Veri erişim + iş mantığı katmanı — TEK giriş noktası.
// Faz 1'de bu modülün İÇİ Supabase istemcisine döner; görünümler yalnızca
// buradaki async API'yi kullanır, kaynağı bilmez.
//
// KALICILIK (bu faz): tarayıcı localStorage. İlk yüklemede JSON tohumları
// (items/ops/outsource/crm-snapshot) okunur; her mutasyon localStorage'a yazılır.
// Netlify uygulamasının npoint+localStorage modelinin yerel eşdeğeri.
//
// Menü yapısı = netlify BASE_NAV_GROUPS (aquatronic-v7.html) — Salih onaylı:
//   active · planned · finished · production(alt) · cable&socket(alt) · pano/psu · motor · dış · pool

// DİKKAT: CRM verisi/kodu BU DOSYADA DEĞİL — src/data/crm-store.js'te.
// build:uretim paketi crm-store'u hiç import etmez (satış verisi sızmaz).
const dataModules = import.meta.glob('./{items,outsource,ops}.json', { eager: true });
function loadJson(name) {
    const mod = dataModules[`./${name}.json`];
    return mod ? (mod.default ?? mod) : null;
}
const itemsJson = loadJson('items');
const outsourceJson = loadJson('outsource') ?? [];
const opsJson = loadJson('ops') ?? {};

// Gerçek kaynaklardan (STOK.xlsx ÜRETİM sayfaları + scv CSV) çıkarılmış BOM
// tohumu — yalnız BOŞ reçeteleri doldurur, kullanıcının girdiğini asla ezmez.
import bomSeed from './bom-seed.json';

// ─── Menü grupları (operasyon tarafı) ────────────────────────────────────
// type: stock = ürün kartı grid'i (subs ile) · active/planned/outsource/pool = özel görünüm
export const OP_GROUPS = [
    { id: 'active',   label: 'Aktif Üretim',   icon: 'active',   type: 'active' },
    { id: 'planned',  label: 'Planlı Üretim',  icon: 'planned',  type: 'planned' },
    { id: 'finished', label: 'Bitmiş Ürünler', icon: 'finished', type: 'stock',
        subs: [{ key: 'finished', label: 'Bitmiş', match: { family: 'finished' } }] },
    { id: 'production', label: 'Üretim', icon: 'production', type: 'stock',
        subs: [
            { key: 'lighting', label: 'Aydınlatma', match: { family: 'lighting' } },
            { key: 'vario',    label: 'Vario',      match: { family: 'vario' } },
            { key: 'switch',   label: 'Switch',     match: { family: 'switch' } },
            { key: 'nozzle',   label: 'Nozul',      match: { family: 'nozzle' } },
            { key: 'powerbox', label: 'PowerBOX',   match: { family: 'powerbox' } },
        ] },
    { id: 'cable', label: 'Kablo & Soket', icon: 'cable', type: 'stock',
        subs: [
            { key: 'cable-spool', label: 'Makara Kablo', match: { family: 'cable', cats: ['Cable', 'Device Cable'] } },
            { key: 'combocable',  label: 'Combo Kablo',  match: { family: 'cable', cats: ['Combo Cable'] } },
            { key: 'socket',      label: 'Soket',        match: { family: 'cable', cats: ['Socket'] } },
        ] },
    { id: 'pano',  label: 'Pano / PSU', icon: 'pano', type: 'stock',
        subs: [{ key: 'pano', label: 'Pano / PSU', match: { family: 'pano' } }] },
    { id: 'motor', label: 'Motor', icon: 'motor', type: 'stock',
        subs: [{ key: 'motor', label: 'Motor', match: { family: 'motor' } }] },
    { id: 'dis',   label: 'Dış Üretim',  icon: 'dis',  type: 'outsource' },
    { id: 'pool',  label: 'Havuz Testi', icon: 'pool', type: 'pool' },
];

export function getOpGroups() { return OP_GROUPS; }
export function getGroup(id) { return OP_GROUPS.find((g) => g.id === id) ?? null; }

// ─── Normalleştirme ───────────────────────────────────────────────────────
// familyOrig ?? family: kürasyon-öncesi orijinal npoint sekmesini geri verir
// (uydurma "enclosure/box-split" kaldırıldı — netlify grupları esas).
function effectiveFamily(raw) {
    return raw.familyOrig ?? raw.family ?? raw.cat ?? 'diger';
}
function normalizeItem(raw, idx) {
    return {
        id: raw.id ?? idx,
        name: raw.name ?? '(isimsiz)',
        family: effectiveFamily(raw),
        cat: raw.cat ?? '',
        qty: Number(raw.qty) || 0,
        critical: Number(raw.critical ?? raw.crt) || 0,
        note: raw.note ?? '',
        photo: raw.photo || null,
        boxQty: raw.boxQty ?? null,
        weight: raw.weight ?? null,
        tr: raw.tr ?? raw.name ?? '',
        history: Array.isArray(raw.history) ? raw.history.slice() : [],
        components: raw.components ?? null,
        bom: Array.isArray(raw.bom) ? raw.bom.map((r) => ({ ...r })) : [],   // [{itemId, qty}]
        archived: !!raw.archived,
    };
}

// ─── Durum (localStorage kalıcılık) ────────────────────────────────────────
const LS_KEY = 'aq_erp_state_v1';
let state = null;

function seed() {
    return {
        items: (itemsJson ?? []).map((r, i) => normalizeItem(r, i)),
        pool: Array.isArray(opsJson.pool) ? opsJson.pool.map((p) => ({ ...p })) : [],
        dis: outsourceJson.map((d) => ({ ...d })),
        activeRuns: [],                 // {id, name, qty, note, startedAt, user}
        plans: [],                      // {id, name, cat, note, createdAt, user}
        productionArchive: Array.isArray(opsJson.productionArchive) ? opsJson.productionArchive.slice() : [],
        activityLog: Array.isArray(opsJson.activityLog) ? opsJson.activityLog.slice() : [],
    };
}

// Şema yükseltme: eski localStorage kayıtlarında bom/archived yok; ekle ve
// BOŞ reçeteleri bom-seed'den doldur (kullanıcı girdisi asla ezilmez).
function migrate(st) {
    if (!st || !Array.isArray(st.items)) return st;
    const seedMap = new Map(bomSeed.map((b) => [String(b.productId), b.bom]));
    for (const it of st.items) {
        if (!Array.isArray(it.bom)) it.bom = [];
        it.archived = !!it.archived;
        const seedBom = seedMap.get(String(it.id));
        if (!it.bom.length && seedBom?.length) it.bom = seedBom.map((r) => ({ ...r }));
    }
    return st;
}

function ensureState() {
    if (state) return state;
    try {
        const raw = localStorage.getItem(LS_KEY);
        state = migrate(raw ? JSON.parse(raw) : seed());
    } catch {
        state = migrate(seed());
    }
    return state;
}

function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* kota dolabilir; sessiz geç */ }
}

export function resetToSeed() {
    state = migrate(seed());
    persist();
}

let _currentUser = 'Salih';
export function setCurrentUser(u) { _currentUser = u || 'Salih'; }
export function getCurrentUser() { return _currentUser; }

function nowTs() { return Date.now(); }
function trDate() { return new Date().toLocaleDateString('tr-TR'); }

// Global aktivite günlüğü (netlify logActivity karşılığı)
export function logActivity(action, target, details) {
    ensureState();
    state.activityLog.unshift({ ts: nowTs(), user: _currentUser, action, target, details: details ?? '' });
    if (state.activityLog.length > 2000) state.activityLog.length = 2000;
}

// ─── Ürünler ───────────────────────────────────────────────────────────────
export function stockStatus(item) {
    if (item.qty <= item.critical) return 'critical';
    if (item.qty <= item.critical * 1.2) return 'low';
    return 'ok';
}
export function stockStatusLabel(status) {
    return status === 'critical' ? 'Kritik' : status === 'low' ? 'Azalıyor' : 'Yeterli';
}

// Varsayılan: arşivdekiler hariç (katalog/seçim listeleri için doğru olan bu).
export async function getItems(includeArchived = false) {
    ensureState();
    return includeArchived ? state.items : state.items.filter((i) => !i.archived);
}

export async function getItemById(id) {
    ensureState();
    return state.items.find((i) => i.id === Number(id) || String(i.id) === String(id)) ?? null;
}

// Bir alt-sekme match'ine göre ürünleri süz (archived=true → yalnız arşiv)
function matchItems(match, archived = false) {
    ensureState();
    if (!match) return [];
    return state.items.filter((i) => {
        if (!!i.archived !== archived) return false;
        if (match.family && i.family !== match.family) return false;
        if (match.cats && !match.cats.includes(i.cat)) return false;
        return true;
    });
}

// Bir stok-grubunun (finished/production/cable/pano/motor) tüm alt-sekmeleri + sayıları
export async function getStockGroup(groupId, archived = false) {
    const g = getGroup(groupId);
    if (!g || g.type !== 'stock') return { group: g, subs: [] };
    const subs = g.subs.map((s) => ({ ...s, items: matchItems(s.match, archived) }));
    return { group: g, subs };
}

// Stok in/out — ürün history + global log (netlify doStockIn/doStockOut birebir)
export async function stockIn(id, amount, note = '') {
    const p = await getItemById(id);
    const amt = parseInt(amount, 10) || 0;
    if (!p || amt <= 0) return p;
    p.qty += amt;
    p.history.unshift({ type: 'in', qty: amt, date: trDate(), note, ts: nowTs(), user: _currentUser });
    logActivity('stock-in', p.name, `+${amt} (yeni stok: ${p.qty})`);
    persist();
    return p;
}
export async function stockOut(id, amount, note = '') {
    const p = await getItemById(id);
    const amt = parseInt(amount, 10) || 0;
    if (!p || amt <= 0) return p;
    p.qty = Math.max(0, p.qty - amt);
    p.history.unshift({ type: 'out', qty: amt, date: trDate(), note, ts: nowTs(), user: _currentUser });
    logActivity('stock-out', p.name, `−${amt} (kalan: ${p.qty})`);
    persist();
    return p;
}

// Ürün bilgisi düzenleme (netlify saveProduct)
export async function saveProduct(id, patch) {
    const p = await getItemById(id);
    if (!p) return null;
    const oldQty = p.qty;
    if (patch.qty !== undefined) p.qty = parseInt(patch.qty, 10) || 0;
    if (patch.critical !== undefined) p.critical = parseInt(patch.critical, 10) || 0;
    if (patch.note !== undefined) p.note = patch.note;
    if (patch.weight !== undefined) p.weight = patch.weight === '' ? null : parseFloat(patch.weight);
    if (patch.boxQty !== undefined) p.boxQty = patch.boxQty === '' ? null : parseInt(patch.boxQty, 10);
    logActivity('product-edit', p.name, oldQty !== p.qty ? `stok ${oldQty} → ${p.qty}` : 'bilgi güncellendi');
    persist();
    return p;
}

// ─── Ürün ekle / arşivle / sayım ───────────────────────────────────────────
// Silme YOK: arşivlenen kalem katalog+KPI dışına çıkar, geri alınabilir.
export async function addProduct({ name, family, cat = '', critical = 0, note = '', photo = '' }) {
    ensureState();
    const trimmed = (name ?? '').trim();
    if (!trimmed) return { ok: false, error: 'Ürün adı boş olamaz.' };
    if (state.items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: 'Bu adla bir ürün zaten kayıtlı.' };
    }
    const maxId = state.items.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0);
    const photoName = String(photo ?? '').trim().replace(/^\/+/, '').replace(/^foto\//i, '');
    const item = normalizeItem({
        id: maxId + 1, name: trimmed, family, cat, qty: 0,
        critical: parseInt(critical, 10) || 0, note: note ?? '',
        photo: photoName ? `foto/${photoName}` : null,
    }, maxId + 1);
    state.items.push(item);
    logActivity('product-add', item.name, `yeni ürün (${family}${cat ? ' / ' + cat : ''})`);
    persist();
    return { ok: true, item };
}

export async function setArchived(id, archived) {
    const p = await getItemById(id);
    if (!p) return null;
    p.archived = !!archived;
    logActivity(archived ? 'product-archive' : 'product-unarchive', p.name,
        archived ? 'arşive taşındı (katalog/KPI dışı)' : 'arşivden geri alındı');
    persist();
    return p;
}

// Sayım Modu: [{id, counted}] — kayıtlı adetten farklı olanlar tek seferde
// düzeltilir; her düzeltme ürün history + deftere "Sayım düzeltmesi" yazar.
export async function applyCount(entries) {
    ensureState();
    const applied = [];
    for (const { id, counted } of entries) {
        const p = state.items.find((i) => String(i.id) === String(id));
        const n = parseInt(counted, 10);
        if (!p || !Number.isFinite(n) || n < 0 || n === p.qty) continue;
        const old = p.qty;
        const diff = n - old;
        p.qty = n;
        p.history.unshift({
            type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff), date: trDate(),
            note: `Sayım düzeltmesi (${old} → ${n})`, ts: nowTs(), user: _currentUser,
        });
        logActivity('count-adjust', p.name, `${old} → ${n} (fark ${diff > 0 ? '+' : ''}${diff})`);
        applied.push({ id: p.id, name: p.name, old, next: n, diff });
    }
    if (applied.length) persist();
    return applied;
}

// ─── BOM (ürün reçetesi) ───────────────────────────────────────────────────
// bom: [{itemId, qty}] — qty = 1 adet ürün için tüketilen komponent adedi.
export async function setBomRow(productId, itemId, qty) {
    const p = await getItemById(productId);
    const comp = await getItemById(itemId);
    const n = parseInt(qty, 10) || 0;
    if (!p || !comp || n <= 0 || String(p.id) === String(comp.id)) return null;
    if (!Array.isArray(p.bom)) p.bom = [];
    const row = p.bom.find((r) => String(r.itemId) === String(comp.id));
    if (row) row.qty = n; else p.bom.push({ itemId: comp.id, qty: n });
    logActivity('bom-edit', p.name, `reçete: ${comp.name} ×${n}`);
    persist();
    return p;
}

export async function removeBomRow(productId, itemId) {
    const p = await getItemById(productId);
    if (!p || !Array.isArray(p.bom)) return null;
    const comp = await getItemById(itemId);
    p.bom = p.bom.filter((r) => String(r.itemId) !== String(itemId));
    logActivity('bom-edit', p.name, `reçeteden çıkarıldı: ${comp?.name ?? '#' + itemId}`);
    persist();
    return p;
}

// Reçete satırları + komponent kayıtları (UI için çözülmüş hali)
export async function getBomDetail(productId) {
    const p = await getItemById(productId);
    if (!p || !Array.isArray(p.bom)) return [];
    return p.bom.map((r) => ({
        itemId: r.itemId, qty: r.qty,
        item: state.items.find((i) => String(i.id) === String(r.itemId)) ?? null,
    }));
}

// Ters liste: bu komponent hangi ürünlerin reçetesinde geçiyor?
export async function getWhereUsed(itemId) {
    ensureState();
    return state.items
        .filter((p) => Array.isArray(p.bom) && p.bom.some((r) => String(r.itemId) === String(itemId)))
        .map((p) => ({ product: p, qty: p.bom.find((r) => String(r.itemId) === String(itemId)).qty }));
}

// ─── Aktif üretim + arşiv ──────────────────────────────────────────────────
export async function getActiveRuns() { return ensureState().activeRuns; }
export async function getProductionArchive() { return ensureState().productionArchive; }

export async function startProduction(productName, qty, note = '') {
    ensureState();
    const run = { id: nowTs(), name: productName, qty: parseInt(qty, 10) || 0, note, startedAt: nowTs(), user: _currentUser };
    state.activeRuns.unshift(run);
    logActivity('production-start', productName, `${run.qty} adet üretime alındı`);
    persist();
    return run;
}
export async function completeRun(runId) {
    ensureState();
    const idx = state.activeRuns.findIndex((r) => r.id === runId);
    if (idx < 0) return null;
    const run = state.activeRuns.splice(idx, 1)[0];
    run.completedAt = nowTs();
    state.productionArchive.unshift(run);
    // Bitmiş ürün stoğuna ekle (varsa) + BOM doluysa komponentleri tüket
    const p = state.items.find((i) => i.name === run.name);
    if (p) {
        p.qty += run.qty;
        p.history.unshift({ type: 'in', qty: run.qty, date: trDate(), note: 'Üretim tamamlandı', ts: nowTs(), user: 'Üretim' });
        if (Array.isArray(p.bom)) {
            for (const row of p.bom) {
                const comp = state.items.find((i) => String(i.id) === String(row.itemId));
                const consume = (Number(row.qty) || 0) * run.qty;
                if (!comp || consume <= 0) continue;
                comp.qty = Math.max(0, comp.qty - consume);
                comp.history.unshift({
                    type: 'out', qty: consume, date: trDate(),
                    note: `Üretim tüketimi — ${run.name} ×${run.qty}`, ts: nowTs(), user: 'Üretim',
                });
                logActivity('production-consume', comp.name, `−${consume} (${run.name} ×${run.qty}, kalan: ${comp.qty})`);
            }
        }
    }
    logActivity('production-done', run.name, `${run.qty} adet tamamlandı → stok`);
    persist();
    return run;
}

// ─── Planlı üretim (PDF/not kartları) ──────────────────────────────────────
export async function getPlans() { return ensureState().plans; }
export async function addPlan(name, cat, note) {
    ensureState();
    const plan = { id: nowTs(), name, cat: cat ?? '', note: note ?? '', createdAt: nowTs(), user: _currentUser };
    state.plans.unshift(plan);
    logActivity('plan-add', name, 'yeni üretim planı');
    persist();
    return plan;
}
export async function deletePlan(id) {
    ensureState();
    state.plans = state.plans.filter((p) => p.id !== id);
    persist();
}

// ─── Havuz testi (ops.pool) ────────────────────────────────────────────────
export async function getPoolItems() { return ensureState().pool; }
export async function getPoolItemById(id) {
    ensureState();
    return state.pool.find((p) => String(p.id) === String(id)) ?? null;
}

// ─── Dış üretim (fason — Ömer Kablo) ───────────────────────────────────────
export async function getOutsourceJobs() { return ensureState().dis; }

// ─── Hareket defteri (global activityLog) ──────────────────────────────────
export async function getActivityLog() {
    ensureState();
    return state.activityLog.slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

// ─── KPI'lar + genel bakış ─────────────────────────────────────────────────
export async function getKpis() {
    ensureState();
    const live = state.items.filter((i) => !i.archived);
    const critical = live.filter((i) => stockStatus(i) === 'critical');
    return {
        totalItems: live.length,
        criticalCount: critical.length,
        activeCount: state.activeRuns.length,
        outsourceCount: state.dis.length,
    };
}
export async function getCriticalItems() {
    ensureState();
    return state.items
        .filter((i) => !i.archived && stockStatus(i) !== 'ok')
        .sort((a, b) => (a.qty - a.critical) - (b.qty - b.critical));
}

// ─── CRM (Google Sheets v4 aynası) ──────────────────────────────────────────
// Yerel yazma API'si (tools/crm_api.py, port 5001) ayaktaysa canlı Sheet'ten
// okunur ve yazma açılır; değilse pakete gömülü snapshot'a düşülür (salt-okur).
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

// ─── Ortak yardımcılar ─────────────────────────────────────────────────────
export function formatMoney(value, currency = 'EUR') {
    if (!value) return '—';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}
export function familyIcon(family) {
    const icons = {
        finished: '🎛️', lighting: '💡', vario: '💧', switch: '⚙️', nozzle: '💦',
        powerbox: '⚡', cable: '🔌', pano: '🗄️', motor: '🔩',
    };
    return icons[family] || '📦';
}
