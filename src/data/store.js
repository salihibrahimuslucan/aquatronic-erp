// Veri erişim + iş mantığı katmanı — TEK giriş noktası.
// FAZ 1: Supabase yapılandırılmışsa (VITE_SUPABASE_*) veri buluttan yüklenir,
// her mutasyon buluta yazılır (write-through) ve bellek kopyası güncellenir;
// görünümler yalnızca buradaki async API'yi kullanır, kaynağı bilmez.
// Yapılandırma yoksa eski davranış aynen sürer: JSON tohum + localStorage.
//
// Bulut modeli: stock_moves = hakikat defteri (apply_stock_move RPC atomik),
// üretim tamamlama = complete_production_order RPC (üret + BOM tüket tek işlem).
//
// Menü yapısı = netlify BASE_NAV_GROUPS (aquatronic-v7.html) — Salih onaylı:
//   active · planned · finished · production(alt) · cable&socket(alt) · pano/psu · motor · dış · pool

import { supabase, isCloud, unwrap, removeFile } from './supabase.js';

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

// BOM tohumu (bu depoda sentetik örnek) — yalnız BOŞ reçeteleri doldurur,
// kullanıcının girdiğini asla ezmez.
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
    { id: 'elektronik', label: 'Elektronik', icon: 'chip', type: 'stock',
        subs: [
            { key: 'pcbcard', label: 'PCB Kartları',    match: { family: 'pcbcard' } },
            { key: 'pcbcomp', label: 'PCB Bileşenleri', match: { family: 'pcbcomp' } },
        ] },
    { id: 'motor', label: 'Motor', icon: 'motor', type: 'stock',
        subs: [{ key: 'motor', label: 'Motor', match: { family: 'motor' } }] },
    { id: 'dis',   label: 'Dış Üretim',  icon: 'dis',  type: 'outsource' },
    { id: 'pool',  label: 'Havuz Testi', icon: 'pool', type: 'pool' },
];

export function getOpGroups() { return OP_GROUPS; }
export function getGroup(id) { return OP_GROUPS.find((g) => g.id === id) ?? null; }

// Vitrinde gezilebilir aileler (OP_GROUPS alt-sekmelerinden türetilir).
// Vitrin-dışı aileler (box/enclosure/xhsocket/chemical) bakımsız eşik
// verisiyle kritik-stok önerisini şişirmesin diye öneri bunlarla sınırlı.
const VISIBLE_FAMILIES = new Set(
    OP_GROUPS.flatMap((g) => g.subs?.map((s) => s.match.family) ?? []),
);

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

// Bulut satırı (snake_case) → uygulama ürün şekli
function rowToItem(r) {
    return {
        id: r.id, name: r.name, family: r.family, cat: r.cat ?? '',
        qty: Number(r.qty) || 0, critical: Number(r.critical) || 0,
        note: r.note ?? '', photo: r.photo || null,
        boxQty: r.box_qty ?? null, weight: r.weight === null ? null : Number(r.weight),
        tr: r.tr ?? r.name, history: [], components: null,
        sourceType: r.source_type ?? '', supplier: r.supplier ?? '', sourceNote: r.source_note ?? '',
        bom: [], archived: !!r.archived,
    };
}

// Bulut satırları → uygulama şekilleri (havuz testi / dış üretim)
function rowToPool(p) {
    return {
        id: p.id, device: p.device, sn: p.sn, desc: p.desc, status: p.status,
        address: p.address, currentIdle: p.current_idle, currentRun: p.current_run,
        height: p.height, startDate: p.start_date, endDate: p.end_date, notes: p.notes,
    };
}
function rowToOutsource(o) {
    return {
        id: o.id, item: o.item, qty: o.qty, status: o.status, reqDate: o.req_date,
        givenMat: o.given_mat, receivedQty: o.received_qty, receivedDate: o.received_date,
        price: o.price, note: o.note,
    };
}

// stock_moves satırı → ürün history girdisi (görünümler in/out bekler)
function moveToHistory(m) {
    const dirIn = m.move_type === 'in' || m.move_type === 'produce'
        || (m.move_type === 'count' && m.qty >= 0);
    return {
        type: dirIn ? 'in' : 'out', qty: Math.abs(m.qty),
        date: new Date(m.created_at).toLocaleDateString('tr-TR'),
        note: m.note ?? '', ts: new Date(m.created_at).getTime(), user: m.user_name ?? '',
    };
}

// ─── Durum (bulut write-through önbelleği / localStorage kalıcılık) ────────
const LS_KEY = 'aq_erp_state_v1';
const CLOUD_TTL_MS = 15_000;     // gezinmede başkalarının değişikliği bu aralıkla tazelenir
let state = null;
let _loadedAt = 0;

function seed() {
    return {
        items: (itemsJson ?? []).map((r, i) => normalizeItem(r, i)),
        pool: Array.isArray(opsJson.pool) ? opsJson.pool.map((p) => ({ ...p })) : [],
        dis: outsourceJson.map((d) => ({ ...d })),
        activeRuns: [],                 // {id, name, qty, note, startedAt, user}
        plans: [],                      // {id, name, cat, note, createdAt, user}
        productionArchive: Array.isArray(opsJson.productionArchive) ? opsJson.productionArchive.slice() : [],
        activityLog: Array.isArray(opsJson.activityLog) ? opsJson.activityLog.slice() : [],
        serials: [],                    // {id, serial, itemId, productName, orderId, status, createdAt}
        purchaseOrders: [],             // {id, supplier, partnerId, status, note, createdAt, updatedAt}
        poLines: [],                    // {id, poId, itemId, qty, receivedQty}
        partners: [],                   // {id, name, kind, contactPerson, email, phone, address, country, note, archived, createdAt, updatedAt}
    };
}

// Şema yükseltme (yalnız lokal mod): eski kayıtlarda bom/archived yok; ekle ve
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
    // Eski localStorage kayıtlarında yeni diziler yok olabilir (satın alma-lite
    // ve cari kartotek sonradan eklendi) — eksikse boş dizi ata, crash etmesin.
    if (!Array.isArray(st.purchaseOrders)) st.purchaseOrders = [];
    if (!Array.isArray(st.poLines)) st.poLines = [];
    if (!Array.isArray(st.partners)) st.partners = [];
    return st;
}

async function loadCloudState() {
    const [items, boms, moves, orders, pool, dis, log] = await Promise.all([
        supabase.from('items').select('*').order('id').then(unwrap),
        supabase.from('boms').select('*').then(unwrap),
        supabase.from('stock_moves').select('*').order('created_at', { ascending: false }).limit(600).then(unwrap),
        supabase.from('production_orders').select('*').order('created_at', { ascending: false }).then(unwrap),
        supabase.from('pool_tests').select('*').order('id').then(unwrap),
        supabase.from('outsource_jobs').select('*').order('id').then(unwrap),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500).then(unwrap),
    ]);
    const byId = new Map();
    const st = {
        items: items.map((r) => { const it = rowToItem(r); byId.set(String(it.id), it); return it; }),
        pool: pool.map(rowToPool),
        dis: dis.map(rowToOutsource),
        activeRuns: orders.filter((o) => o.status === 'active').map((o) => ({
            id: o.id, name: o.product_name, qty: o.qty, note: o.note, pdf: o.pdf_path ?? '',
            itemId: o.item_id ?? null, dealId: o.source_deal_id ?? '',
            startedAt: o.started_at ? new Date(o.started_at).getTime() : null, user: o.user_name,
        })),
        plans: orders.filter((o) => o.status === 'planned').map((o) => ({
            id: o.id, name: o.product_name, qty: o.qty, cat: o.cat ?? '', note: o.note, pdf: o.pdf_path ?? '',
            itemId: o.item_id ?? null, dealId: o.source_deal_id ?? '',
            createdAt: new Date(o.created_at).getTime(), user: o.user_name,
        })),
        productionArchive: orders.filter((o) => o.status === 'done').map((o) => ({
            id: o.id, name: o.product_name, qty: o.qty, note: o.note, pdf: o.pdf_path ?? '',
            itemId: o.item_id ?? null, dealId: o.source_deal_id ?? '',
            completedAt: o.completed_at ? new Date(o.completed_at).getTime() : null, user: o.user_name,
        })),
        activityLog: log.map((a) => ({
            ts: new Date(a.created_at).getTime(), user: a.user_name,
            action: a.action, target: a.target, details: a.details,
        })),
        serials: [],   // seri kayıtları ürün detayında talep üzerine çekilir (getSerialsForItem)
    };
    for (const b of boms) {
        byId.get(String(b.product_id))?.bom.push({ itemId: b.component_id, qty: b.qty });
    }
    for (const m of moves) {
        byId.get(String(m.item_id))?.history.push(moveToHistory(m));
    }
    return st;
}

async function ensureState() {
    if (isCloud()) {
        if (state && (Date.now() - _loadedAt) < CLOUD_TTL_MS) return state;
        state = await loadCloudState();
        _loadedAt = Date.now();
        return state;
    }
    if (state) return state;
    try {
        const raw = localStorage.getItem(LS_KEY);
        state = migrate(raw ? JSON.parse(raw) : seed());
    } catch {
        state = migrate(seed());
    }
    return state;
}

// Bulutta mutasyon sonrası önbelleği canlı tut (tam yeniden yükleme gerektiren
// işlemler invalidate() çağırır — bir sonraki ekran taze veri çeker).
function invalidate() { _loadedAt = 0; }

function persist() {
    if (isCloud()) return;   // bulutta her mutasyon kendini yazar
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* kota dolabilir; sessiz geç */ }
}

export function resetToSeed() {
    if (isCloud()) { invalidate(); return; }
    state = migrate(seed());
    persist();
}

let _currentUser = 'Salih';
let _currentRole = 'yonetici';
export function setCurrentUser(u, role) { _currentUser = u || 'Salih'; if (role) _currentRole = role; }
export function getCurrentUser() { return _currentUser; }
export function getCurrentRole() { return _currentRole; }

function nowTs() { return Date.now(); }
function trDate() { return new Date().toLocaleDateString('tr-TR'); }

// Global aktivite günlüğü (netlify logActivity karşılığı) — bulutta ayrıca
// activity_log tablosuna yazar (beklenmez; hata sessizce loglanır).
export function logActivity(action, target, details) {
    if (!state) return;
    state.activityLog.unshift({ ts: nowTs(), user: _currentUser, action, target, details: details ?? '' });
    if (state.activityLog.length > 2000) state.activityLog.length = 2000;
    if (isCloud()) {
        supabase.from('activity_log')
            .insert({ user_name: _currentUser, action, target, details: details ?? '' })
            .then(({ error }) => { if (error) console.error('activity_log:', error.message); });
    }
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
    await ensureState();
    return includeArchived ? state.items : state.items.filter((i) => !i.archived);
}

export async function getItemById(id) {
    await ensureState();
    return state.items.find((i) => i.id === Number(id) || String(i.id) === String(id)) ?? null;
}

// Bir alt-sekme match'ine göre ürünleri süz (archived=true → yalnız arşiv)
function matchItems(match, archived = false) {
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
    await ensureState();
    const g = getGroup(groupId);
    if (!g || g.type !== 'stock') return { group: g, subs: [] };
    const subs = g.subs.map((s) => ({ ...s, items: matchItems(s.match, archived) }));
    return { group: g, subs };
}

// Bulutta atomik stok hareketi (RPC) + bellek güncellemesi
async function cloudMove(item, moveType, signedQty, note, ref = '') {
    const row = unwrap(await supabase.rpc('apply_stock_move', {
        p_item_id: item.id, p_move_type: moveType, p_qty: signedQty,
        p_note: note, p_ref: ref, p_user: _currentUser,
    }));
    item.qty = Number(row.qty) || 0;
    item.history.unshift({
        type: signedQty >= 0 ? 'in' : 'out', qty: Math.abs(signedQty),
        date: trDate(), note, ts: nowTs(), user: _currentUser,
    });
    return item;
}

// Stok in/out — ürün history + global log (netlify doStockIn/doStockOut birebir)
export async function stockIn(id, amount, note = '') {
    const p = await getItemById(id);
    const amt = parseInt(amount, 10) || 0;
    if (!p || amt <= 0) return p;
    if (isCloud()) {
        await cloudMove(p, 'in', amt, note);
    } else {
        p.qty += amt;
        p.history.unshift({ type: 'in', qty: amt, date: trDate(), note, ts: nowTs(), user: _currentUser });
    }
    logActivity('stock-in', p.name, `+${amt} (yeni stok: ${p.qty})`);
    persist();
    return p;
}
export async function stockOut(id, amount, note = '') {
    const p = await getItemById(id);
    const amt = parseInt(amount, 10) || 0;
    if (!p || amt <= 0) return p;
    if (isCloud()) {
        await cloudMove(p, 'out', -amt, note);
    } else {
        p.qty = Math.max(0, p.qty - amt);
        p.history.unshift({ type: 'out', qty: amt, date: trDate(), note, ts: nowTs(), user: _currentUser });
    }
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
    if (patch.sourceType !== undefined) p.sourceType = patch.sourceType ?? '';
    if (patch.supplier !== undefined) p.supplier = patch.supplier ?? '';
    if (patch.sourceNote !== undefined) p.sourceNote = patch.sourceNote ?? '';
    if (patch.photo !== undefined) {
        const raw = String(patch.photo ?? '').trim();
        if (!raw) p.photo = null;
        else if (/^https?:\/\//i.test(raw)) p.photo = raw;   // Storage public URL
        else p.photo = `foto/${raw.replace(/^\/+/, '').replace(/^foto\//i, '')}`;
    }
    if (isCloud()) {
        unwrap(await supabase.from('items').update({
            qty: p.qty, critical: p.critical, note: p.note,
            weight: p.weight, box_qty: p.boxQty, photo: p.photo,
            source_type: p.sourceType, supplier: p.supplier, source_note: p.sourceNote,
        }).eq('id', p.id).select().single());
    }
    logActivity('product-edit', p.name, oldQty !== p.qty ? `stok ${oldQty} → ${p.qty}` : 'bilgi güncellendi');
    persist();
    return p;
}

// ─── Ürün ekle / arşivle / sayım ───────────────────────────────────────────
// Silme YOK: arşivlenen kalem katalog+KPI dışına çıkar, geri alınabilir.
export async function addProduct({ name, family, cat = '', critical = 0, note = '', photo = '' }) {
    await ensureState();
    const trimmed = (name ?? '').trim();
    if (!trimmed) return { ok: false, error: 'Ürün adı boş olamaz.' };
    if (state.items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, error: 'Bu adla bir ürün zaten kayıtlı.' };
    }
    const photoName = String(photo ?? '').trim().replace(/^\/+/, '').replace(/^foto\//i, '');
    const fields = {
        name: trimmed, family, cat, qty: 0,
        critical: parseInt(critical, 10) || 0, note: note ?? '',
        photo: photoName ? `foto/${photoName}` : null,
    };
    let item;
    if (isCloud()) {
        try {
            item = rowToItem(unwrap(await supabase.from('items').insert(fields).select().single()));
        } catch (e) {
            return { ok: false, error: e.message };
        }
    } else {
        const maxId = state.items.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0);
        item = normalizeItem({ id: maxId + 1, ...fields }, maxId + 1);
    }
    state.items.push(item);
    logActivity('product-add', item.name, `yeni ürün (${family}${cat ? ' / ' + cat : ''})`);
    persist();
    return { ok: true, item };
}

export async function setArchived(id, archived) {
    const p = await getItemById(id);
    if (!p) return null;
    p.archived = !!archived;
    if (isCloud()) {
        unwrap(await supabase.from('items').update({ archived: p.archived }).eq('id', p.id).select().single());
    }
    logActivity(archived ? 'product-archive' : 'product-unarchive', p.name,
        archived ? 'arşive taşındı (katalog/KPI dışı)' : 'arşivden geri alındı');
    persist();
    return p;
}

// Sayım Modu: [{id, counted}] — kayıtlı adetten farklı olanlar tek seferde
// düzeltilir; her düzeltme ürün history + deftere "Sayım düzeltmesi" yazar.
export async function applyCount(entries) {
    await ensureState();
    const applied = [];
    for (const { id, counted } of entries) {
        const p = state.items.find((i) => String(i.id) === String(id));
        const n = parseInt(counted, 10);
        if (!p || !Number.isFinite(n) || n < 0 || n === p.qty) continue;
        const old = p.qty;
        const diff = n - old;
        if (isCloud()) {
            await cloudMove(p, 'count', diff, `Sayım düzeltmesi (${old} → ${n})`);
        } else {
            p.qty = n;
            p.history.unshift({
                type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff), date: trDate(),
                note: `Sayım düzeltmesi (${old} → ${n})`, ts: nowTs(), user: _currentUser,
            });
        }
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
    if (isCloud()) {
        unwrap(await supabase.from('boms')
            .upsert({ product_id: p.id, component_id: comp.id, qty: n }, { onConflict: 'product_id,component_id' })
            .select());
    }
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
    if (isCloud()) {
        unwrap(await supabase.from('boms').delete()
            .eq('product_id', p.id).eq('component_id', Number(itemId)).select());
    }
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
    await ensureState();
    return state.items
        .filter((p) => Array.isArray(p.bom) && p.bom.some((r) => String(r.itemId) === String(itemId)))
        .map((p) => ({ product: p, qty: p.bom.find((r) => String(r.itemId) === String(itemId)).qty }));
}

// ─── Aktif üretim + arşiv ──────────────────────────────────────────────────
export async function getActiveRuns() { return (await ensureState()).activeRuns; }
export async function getProductionArchive() { return (await ensureState()).productionArchive; }

// Raporlar Paneli: tamamlanmış üretim arşivini aya göre grupla, en yeni 6 ay.
// Salt-okuma (hiçbir mutasyon yok). completedAt = epoch ms; kayıtsız/eksik
// tarihli emirler atlanır. "Son 6 ay" = veri bulunan en güncel 6 takvim ayı
// (sistem saatine göre pencere DEĞİL — arşivde hangi aylar varsa onların en
// yenisi; boş pencere yerine anlamlı özet verir).
const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export async function getProductionMonthlySummary(maxMonths = 6) {
    const archive = await getProductionArchive();
    const buckets = new Map();   // 'YYYY-MM' -> {month, label, orderCount, totalQty}
    for (const o of archive) {
        if (!o.completedAt) continue;
        const d = new Date(o.completedAt);
        if (Number.isNaN(d.getTime())) continue;
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!buckets.has(month)) {
            buckets.set(month, { month, label: `${TR_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`, orderCount: 0, totalQty: 0 });
        }
        const b = buckets.get(month);
        b.orderCount += 1;
        b.totalQty += Number(o.qty) || 0;
    }
    return [...buckets.values()]
        .sort((a, b) => b.month.localeCompare(a.month))   // en yeni ay üstte
        .slice(0, maxMonths);
}

export async function startProduction(productName, qty, note = '') {
    await ensureState();
    const n = parseInt(qty, 10) || 0;
    let run;
    if (isCloud()) {
        const item = state.items.find((i) => i.name === productName);
        const row = unwrap(await supabase.from('production_orders').insert({
            item_id: item?.id ?? null, product_name: productName, qty: n,
            status: 'active', note, user_name: _currentUser, started_at: new Date().toISOString(),
        }).select().single());
        run = { id: row.id, name: productName, qty: n, note, pdf: '', startedAt: nowTs(), user: _currentUser };
    } else {
        run = { id: nowTs(), name: productName, qty: n, note, pdf: '', startedAt: nowTs(), user: _currentUser };
    }
    state.activeRuns.unshift(run);
    logActivity('production-start', productName, `${run.qty} adet üretime alındı`);
    persist();
    return run;
}

// Üretilen her cihaza seri no: AQ-<emir>-NNN (emre bağlı, izlenebilir).
async function generateSerials(run) {
    const n = Number(run.qty) || 0;
    if (n <= 0) return;
    const item = state.items.find((i) => i.name === run.name);
    const cloudOrder = (typeof run.id === 'number' && run.id < 1e12) ? run.id : null;
    const rows = [];
    for (let i = 1; i <= n; i++) {
        rows.push({ serial: `AQ-${run.id}-${String(i).padStart(3, '0')}`,
            item_id: item?.id ?? null, product_name: run.name, order_id: cloudOrder, status: 'produced' });
    }
    if (isCloud()) {
        try { unwrap(await supabase.from('unit_serials').insert(rows).select('id')); }
        catch (e) { console.error('seri no yazılamadı:', e.message); }
    } else {
        for (const r of rows) state.serials.push({ id: `${nowTs()}-${r.serial}`, serial: r.serial,
            itemId: r.item_id, productName: r.product_name, orderId: r.order_id, status: 'produced', createdAt: nowTs() });
    }
}

export async function getSerialsForItem(itemId) {
    if (isCloud()) {
        const data = unwrap(await supabase.from('unit_serials').select('*')
            .eq('item_id', itemId).order('created_at', { ascending: false }).limit(400));
        return data.map((r) => ({ id: r.id, serial: r.serial, status: r.status,
            orderId: r.order_id, productName: r.product_name, note: r.note ?? '',
            createdAt: new Date(r.created_at).getTime() }));
    }
    await ensureState();
    return (state.serials ?? []).filter((s) => String(s.itemId) === String(itemId))
        .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateSerialStatus(id, status) {
    if (isCloud()) {
        unwrap(await supabase.from('unit_serials').update({ status }).eq('id', id).select('id'));
    } else {
        await ensureState();
        const s = (state.serials ?? []).find((x) => String(x.id) === String(id));
        if (s) s.status = status;
    }
}

export async function completeRun(runId) {
    await ensureState();
    const idx = state.activeRuns.findIndex((r) => r.id === runId);
    if (idx < 0) return null;
    const run = state.activeRuns.splice(idx, 1)[0];
    run.completedAt = nowTs();
    state.productionArchive.unshift(run);

    if (isCloud()) {
        // Üretimi stoğa al + BOM'u tüket — tek atomik RPC; defter kayıtları app'ten
        unwrap(await supabase.rpc('complete_production_order', { p_order_id: run.id, p_user: _currentUser }));
        const p = state.items.find((i) => i.name === run.name);
        if (p?.bom?.length) {
            for (const row of p.bom) {
                const comp = state.items.find((i) => String(i.id) === String(row.itemId));
                const consume = (Number(row.qty) || 0) * run.qty;
                if (comp && consume > 0) logActivity('production-consume', comp.name, `−${consume} (${run.name} ×${run.qty})`);
            }
        }
        await generateSerials(run);     // her üretilen cihaza seri no
        logActivity('production-done', run.name, `${run.qty} adet tamamlandı → stok`);
        invalidate();   // adetler DB'de değişti — bir sonraki ekran taze çeker
        return run;
    }

    // Lokal mod: bitmiş ürün stoğuna ekle + BOM doluysa komponentleri tüket
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
    await generateSerials(run);     // her üretilen cihaza seri no
    logActivity('production-done', run.name, `${run.qty} adet tamamlandı → stok`);
    persist();
    return run;
}

// ─── Planlı üretim (PDF/not kartları) ──────────────────────────────────────
export async function getPlans() { return (await ensureState()).plans; }
export async function addPlan(name, cat, note, pdfPath = '') {
    await ensureState();
    let plan;
    if (isCloud()) {
        const row = unwrap(await supabase.from('production_orders').insert({
            product_name: name, qty: 1, status: 'planned', cat: cat ?? '',
            note: note ?? '', pdf_path: pdfPath ?? '', user_name: _currentUser,
        }).select().single());
        plan = { id: row.id, name, cat: cat ?? '', note: note ?? '', pdf: pdfPath ?? '', createdAt: nowTs(), user: _currentUser };
    } else {
        plan = { id: nowTs(), name, cat: cat ?? '', note: note ?? '', pdf: '', createdAt: nowTs(), user: _currentUser };
    }
    state.plans.unshift(plan);
    logActivity('plan-add', name, 'yeni üretim planı');
    persist();
    return plan;
}

// Var olan plan kartına PDF bağla (dosya Storage'a görünümde yüklenir)
export async function setPlanPdf(id, pdfPath) {
    await ensureState();
    const plan = state.plans.find((p) => p.id === id);
    if (!plan) return null;
    if (isCloud()) {
        unwrap(await supabase.from('production_orders').update({ pdf_path: pdfPath ?? '' }).eq('id', id).select());
        if (plan.pdf && plan.pdf !== pdfPath) removeFile(plan.pdf);   // eskisi kovada kalmasın
    }
    plan.pdf = pdfPath ?? '';
    logActivity('plan-pdf', plan.name, pdfPath ? 'PDF eklendi' : 'PDF kaldırıldı');
    persist();
    return plan;
}

export async function deletePlan(id) {
    await ensureState();
    const plan = state.plans.find((p) => p.id === id);
    if (isCloud()) {
        unwrap(await supabase.from('production_orders').delete().eq('id', id).eq('status', 'planned').select());
        if (plan?.pdf) removeFile(plan.pdf);
    }
    state.plans = state.plans.filter((p) => p.id !== id);
    persist();
}

// ─── Faz 2 köprüsü: CRM fırsatı → üretim emri ──────────────────────────────
// Fırsattan PLANLI emir açar (item_id BOM köprüsü için, dealId geri-bağ için).
// Bulut: create_order_from_deal RPC (rol denetimi + atomik). Emir Planlı
// Üretim'de görünür; "Üretime Al" ile aktive edilir.
export async function createOrderFromDeal({ dealId, itemId = null, productName, qty, note = '' }) {
    await ensureState();
    const n = parseInt(qty, 10) || 0;
    if (!productName || n <= 0) throw new Error('ürün ve adet (>0) zorunlu');
    let plan;
    if (isCloud()) {
        const row = unwrap(await supabase.rpc('create_order_from_deal', {
            p_deal_id: dealId, p_item_id: itemId, p_product_name: productName,
            p_qty: n, p_note: note, p_user: _currentUser,
        }));
        plan = { id: row.id, name: row.product_name, qty: row.qty, cat: row.cat ?? 'CRM',
            note: row.note ?? '', pdf: '', itemId: row.item_id ?? null, dealId: row.source_deal_id ?? dealId,
            createdAt: new Date(row.created_at).getTime(), user: row.user_name };
    } else {
        plan = { id: nowTs(), name: productName, qty: n, cat: 'CRM', note, pdf: '',
            itemId, dealId, createdAt: nowTs(), user: _currentUser };
    }
    state.plans.unshift(plan);
    logActivity('deal-to-order', productName, `Fırsat ${dealId} → planlı emir (${n} adet)`);
    persist();
    return plan;
}

// Planlı emri Aktif Üretim'e alır (planned → active). item_id/dealId taşınır.
export async function startPlan(planId) {
    await ensureState();
    const idx = state.plans.findIndex((p) => p.id === planId);
    if (idx < 0) return null;
    const plan = state.plans[idx];
    if (isCloud()) {
        unwrap(await supabase.from('production_orders')
            .update({ status: 'active', started_at: new Date().toISOString() })
            .eq('id', planId).eq('status', 'planned').select());
    }
    state.plans.splice(idx, 1);
    const run = { id: plan.id, name: plan.name, qty: plan.qty || 1, note: plan.note, pdf: plan.pdf || '',
        itemId: plan.itemId ?? null, dealId: plan.dealId ?? '', startedAt: nowTs(), user: _currentUser };
    state.activeRuns.unshift(run);
    logActivity('production-start', run.name, `${run.qty} adet üretime alındı (planlı emir)`);
    persist();
    return run;
}

// Bir fırsata bağlı üretim emirleri (planlı + aktif + arşiv) — CRM Deal View için.
export async function getOrdersForDeal(dealId) {
    if (!dealId) return [];
    await ensureState();
    const tag = (arr, status) => arr.filter((o) => String(o.dealId) === String(dealId))
        .map((o) => ({ id: o.id, name: o.name, qty: o.qty, status }));
    return [
        ...tag(state.activeRuns, 'active'),
        ...tag(state.plans, 'planned'),
        ...tag(state.productionArchive, 'done'),
    ];
}

// ─── Havuz testi (pool_tests / ops.pool) ───────────────────────────────────
export async function getPoolItems() { return (await ensureState()).pool; }
export async function getPoolItemById(id) {
    await ensureState();
    return state.pool.find((p) => String(p.id) === String(id)) ?? null;
}

const POOL_FIELDS = ['device', 'sn', 'desc', 'status', 'address', 'currentIdle', 'currentRun', 'height', 'startDate', 'endDate', 'notes'];
function poolRowOf(fields) {
    return {
        device: fields.device ?? '', sn: fields.sn ?? '', desc: fields.desc ?? '',
        status: fields.status ?? '', address: fields.address ?? '',
        current_idle: fields.currentIdle ?? '', current_run: fields.currentRun ?? '',
        height: fields.height ?? '', start_date: fields.startDate ?? '',
        end_date: fields.endDate ?? '', notes: fields.notes ?? '',
    };
}

export async function addPoolTest(fields) {
    await ensureState();
    if (!String(fields.device ?? '').trim()) return { ok: false, error: 'Cihaz adı boş olamaz.' };
    let rec;
    if (isCloud()) {
        try {
            rec = rowToPool(unwrap(await supabase.from('pool_tests').insert(poolRowOf(fields)).select().single()));
        } catch (e) { return { ok: false, error: e.message }; }
    } else {
        const maxId = state.pool.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
        rec = { id: maxId + 1 };
        for (const k of POOL_FIELDS) rec[k] = fields[k] ?? '';
    }
    state.pool.push(rec);
    logActivity('pool-add', rec.device, `havuz testi kaydı (SN: ${rec.sn || '—'})`);
    persist();
    return { ok: true, rec };
}

export async function updatePoolTest(id, fields) {
    await ensureState();
    const rec = state.pool.find((p) => String(p.id) === String(id));
    if (!rec) return null;
    if (isCloud()) {
        unwrap(await supabase.from('pool_tests').update(poolRowOf(fields)).eq('id', rec.id).select().single());
    }
    for (const k of POOL_FIELDS) rec[k] = fields[k] ?? '';
    logActivity('pool-edit', rec.device, 'havuz testi kaydı güncellendi');
    persist();
    return rec;
}

export async function deletePoolTest(id) {
    await ensureState();
    const rec = state.pool.find((p) => String(p.id) === String(id));
    if (!rec) return;
    if (isCloud()) {
        unwrap(await supabase.from('pool_tests').delete().eq('id', rec.id).select());
    }
    state.pool = state.pool.filter((p) => p !== rec);
    logActivity('pool-delete', rec.device, `havuz testi kaydı silindi (SN: ${rec.sn || '—'})`);
    persist();
}

// ─── Dış üretim (fason — Ömer Kablo) ───────────────────────────────────────
export async function getOutsourceJobs() { return (await ensureState()).dis; }

const OUTSOURCE_FIELDS = ['item', 'qty', 'status', 'reqDate', 'givenMat', 'receivedQty', 'receivedDate', 'price', 'note'];
function outsourceRowOf(fields) {
    return {
        item: fields.item ?? '', qty: fields.qty ?? '', status: fields.status ?? '',
        req_date: fields.reqDate ?? '', given_mat: fields.givenMat ?? '',
        received_qty: fields.receivedQty ?? '', received_date: fields.receivedDate ?? '',
        price: fields.price ?? '', note: fields.note ?? '',
    };
}

export async function addOutsourceJob(fields) {
    await ensureState();
    if (!String(fields.item ?? '').trim()) return { ok: false, error: 'Ürün / kalem adı boş olamaz.' };
    let job;
    if (isCloud()) {
        try {
            job = rowToOutsource(unwrap(await supabase.from('outsource_jobs').insert(outsourceRowOf(fields)).select().single()));
        } catch (e) { return { ok: false, error: e.message }; }
    } else {
        const maxId = state.dis.reduce((m, j) => Math.max(m, Number(j.id) || 0), 0);
        job = { id: maxId + 1 };
        for (const k of OUTSOURCE_FIELDS) job[k] = fields[k] ?? '';
    }
    state.dis.push(job);
    logActivity('outsource-add', job.item, `fason iş açıldı (${job.qty || '?'} adet)`);
    persist();
    return { ok: true, job };
}

export async function updateOutsourceJob(id, fields) {
    await ensureState();
    const job = state.dis.find((j) => String(j.id) === String(id));
    if (!job) return null;
    if (isCloud()) {
        unwrap(await supabase.from('outsource_jobs').update(outsourceRowOf(fields)).eq('id', job.id).select().single());
    }
    for (const k of OUTSOURCE_FIELDS) job[k] = fields[k] ?? '';
    logActivity('outsource-edit', job.item, 'fason iş güncellendi');
    persist();
    return job;
}

export async function deleteOutsourceJob(id) {
    await ensureState();
    const job = state.dis.find((j) => String(j.id) === String(id));
    if (!job) return;
    if (isCloud()) {
        unwrap(await supabase.from('outsource_jobs').delete().eq('id', job.id).select());
    }
    state.dis = state.dis.filter((j) => j !== job);
    logActivity('outsource-delete', job.item, 'fason iş silindi');
    persist();
}

// ─── Satın Alma-Lite ────────────────────────────────────────────────────────
// Akış: kritik stok → tedarikçi bazlı sipariş önerisi → taslak PO → siparişe
// çevir → mal kabul (receive_po_line RPC, apply_stock_move ile ledger'a girer).
// unit_serials/getSerialsForItem gibi talep-üzerine çekilir — ensureState'in
// toplu bulut yüklemesine (loadCloudState) dahil DEĞİL; local modda state.
function rowToPo(r) {
    return {
        id: r.id, supplier: r.supplier, partnerId: r.partner_id ?? null,
        status: r.status, note: r.note ?? '',
        createdAt: new Date(r.created_at).getTime(),
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    };
}
function rowToPoLine(r) {
    return {
        id: r.id, poId: r.po_id, itemId: r.item_id,
        qty: Number(r.qty) || 0, receivedQty: Number(r.received_qty) || 0,
    };
}

// Kritik stok (qty<=critical, arşiv hariç) → tedarikçiye göre gruplu öneri.
// Önerilen sipariş = max(1, critical*2 - qty) — basit alt sınır kuralı,
// ekranda satır bazında düzenlenebilir. critical<=0 (hiç eşik girilmemiş) hariç
// tutulur — yoksa "eşik hiç ayarlanmamış" kalemler anlamsızca "kritik" sayılır
// ve öneri listesini gürültüyle boğar (canlı veride ~70 kalem bu durumda).
export async function getCriticalSuggestion() {
    const items = await getItems();   // archived hariç
    const groups = new Map();         // supplier key -> {supplier,label,items:[]}
    for (const it of items) {
        if (!VISIBLE_FAMILIES.has(it.family)) continue;
        if (it.critical <= 0) continue;
        if (it.qty > it.critical) continue;
        const supplier = (it.supplier || '').trim();
        const key = supplier || '__unknown__';
        if (!groups.has(key)) groups.set(key, { supplier, label: supplier || 'Tedarikçi belirsiz', items: [] });
        const suggestedQty = Math.max(1, it.critical * 2 - it.qty);
        groups.get(key).items.push({ ...it, suggestedQty });
    }
    return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

// Siparişler tablosu için satır sayısı da lazım — embedded count ile N+1'den kaçın.
export async function listPurchaseOrders() {
    if (isCloud()) {
        const rows = unwrap(await supabase.from('purchase_orders')
            .select('*, purchase_order_lines(count)').order('created_at', { ascending: false }));
        return rows.map((r) => ({ ...rowToPo(r), lineCount: r.purchase_order_lines?.[0]?.count ?? 0 }));
    }
    await ensureState();
    return state.purchaseOrders.slice().sort((a, b) => b.createdAt - a.createdAt)
        .map((po) => ({ ...po, lineCount: state.poLines.filter((l) => String(l.poId) === String(po.id)).length }));
}

// PO detayı: satırlara çözülmüş komponent (item) bilgisiyle birlikte döner
// (kalem adı/foto/mevcut stok — detay ekranında ayrıca getItemById gerekmesin).
export async function getPurchaseOrder(id) {
    if (isCloud()) {
        const poRow = unwrap(await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle());
        if (!poRow) return null;
        const lineRows = unwrap(await supabase.from('purchase_order_lines')
            .select('*, items(*)').eq('po_id', id).order('id'));
        return {
            po: rowToPo(poRow),
            lines: lineRows.map((r) => ({ ...rowToPoLine(r), item: r.items ? rowToItem(r.items) : null })),
        };
    }
    await ensureState();
    const po = state.purchaseOrders.find((p) => String(p.id) === String(id));
    if (!po) return null;
    const lines = state.poLines.filter((l) => String(l.poId) === String(id))
        .map((l) => ({ ...l, item: state.items.find((i) => String(i.id) === String(l.itemId)) ?? null }));
    return { po, lines };
}

// lines: [{itemId, qty}] — taslak sipariş açar (status='taslak'). partnerId
// verilmemişse tedarikçi adına göre kart otomatik eşleşir (serbest-metin
// geri-uyumluluğu: eski akış partner kartı olmadan da çalışmaya devam eder).
export async function createPurchaseOrder(supplier, lines, note = '', partnerId = null) {
    await ensureState();
    const supplierName = (supplier ?? '').trim();
    const cleanLines = (lines ?? [])
        .map((l) => ({ itemId: Number(l.itemId), qty: parseInt(l.qty, 10) || 0 }))
        .filter((l) => l.itemId && l.qty > 0);
    if (!supplierName) return { ok: false, error: 'Tedarikçi adı boş olamaz.' };
    if (!cleanLines.length) return { ok: false, error: 'En az bir kalem (adet > 0) gerekli.' };

    let resolvedPartnerId = partnerId ?? null;
    if (!resolvedPartnerId) {
        const match = (await listPartners('tedarikci'))
            .find((p) => p.name.toLowerCase() === supplierName.toLowerCase());
        if (match) resolvedPartnerId = match.id;
    }

    let po;
    if (isCloud()) {
        try {
            po = rowToPo(unwrap(await supabase.from('purchase_orders')
                .insert({ supplier: supplierName, note: note ?? '', partner_id: resolvedPartnerId }).select().single()));
            const rows = cleanLines.map((l) => ({ po_id: po.id, item_id: l.itemId, qty: l.qty }));
            unwrap(await supabase.from('purchase_order_lines').insert(rows).select());
        } catch (e) {
            if (po) { try { await supabase.from('purchase_orders').delete().eq('id', po.id); } catch { /* best effort temizlik */ } }
            return { ok: false, error: e.message };
        }
    } else {
        const maxId = state.purchaseOrders.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
        po = { id: maxId + 1, supplier: supplierName, partnerId: resolvedPartnerId, status: 'taslak', note: note ?? '', createdAt: nowTs(), updatedAt: nowTs() };
        state.purchaseOrders.unshift(po);
        const maxLineId = state.poLines.reduce((m, l) => Math.max(m, Number(l.id) || 0), 0);
        cleanLines.forEach((l, i) => state.poLines.push({ id: maxLineId + 1 + i, poId: po.id, itemId: l.itemId, qty: l.qty, receivedQty: 0 }));
    }
    logActivity('po-create', po.supplier, `Taslak sipariş açıldı — ${cleanLines.length} kalem (PO#${po.id})`);
    persist();
    return { ok: true, po };
}

// Var olan taslak/açık siparişe satır ekle (aynı tedarikçiye ek kalem).
export async function addPoLine(poId, itemId, qty) {
    const n = parseInt(qty, 10) || 0;
    if (n <= 0) return { ok: false, error: 'Adet 0\'dan büyük olmalı.' };
    let line;
    if (isCloud()) {
        try {
            line = rowToPoLine(unwrap(await supabase.from('purchase_order_lines')
                .insert({ po_id: Number(poId), item_id: Number(itemId), qty: n }).select().single()));
        } catch (e) { return { ok: false, error: e.message }; }
    } else {
        await ensureState();
        const maxLineId = state.poLines.reduce((m, l) => Math.max(m, Number(l.id) || 0), 0);
        line = { id: maxLineId + 1, poId: Number(poId), itemId: Number(itemId), qty: n, receivedQty: 0 };
        state.poLines.push(line);
    }
    logActivity('po-line-add', `PO#${poId}`, `satır eklendi (kalem #${itemId} ×${n})`);
    persist();
    return { ok: true, line };
}

async function setPoStatus(id, status) {
    if (isCloud()) {
        unwrap(await supabase.from('purchase_orders').update({ status }).eq('id', id).select().single());
    } else {
        await ensureState();
        const po = state.purchaseOrders.find((p) => String(p.id) === String(id));
        if (po) { po.status = status; po.updatedAt = nowTs(); }
    }
    logActivity('po-status', `PO#${id}`, `durum → ${status}`);
    persist();
}
// Taslağı siparişe çevir (tedarikçiye fiilen gönderildi anlamında).
export async function convertPoToOrder(id) { return setPoStatus(id, 'siparis'); }
export async function cancelPo(id) { return setPoStatus(id, 'iptal'); }

// Mal kabul: satırın received_qty'sini artırır + items/ledger'a atomik giriş
// yapar (bulutta receive_po_line RPC → apply_stock_move) + PO durumu otomatik
// günceller (tüm satırlar tam=kapandi, kısmen=kismi).
export async function receivePoLine(lineId, recvQty) {
    const n = parseInt(recvQty, 10) || 0;
    if (n <= 0) return { ok: false, error: 'Miktar 0\'dan büyük olmalı.' };

    if (isCloud()) {
        try {
            const row = unwrap(await supabase.rpc('receive_po_line', { line_id: Number(lineId), recv_qty: n }));
            invalidate();   // items.qty ledger üzerinden değişti — bir sonraki ekran taze çeker
            logActivity('po-receive', `PO satırı #${lineId}`, `+${n} mal kabul`);
            return { ok: true, line: rowToPoLine(row) };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    await ensureState();
    const line = state.poLines.find((l) => String(l.id) === String(lineId));
    if (!line) return { ok: false, error: 'Sipariş satırı bulunamadı.' };
    const po = state.purchaseOrders.find((p) => String(p.id) === String(line.poId));
    if (po && ['iptal', 'kapandi'].includes(po.status)) {
        return { ok: false, error: `Sipariş ${po.status} durumunda mal kabul yapılamaz.` };
    }
    line.receivedQty += n;
    const item = state.items.find((i) => String(i.id) === String(line.itemId));
    if (item) {
        item.qty += n;
        item.history.unshift({ type: 'in', qty: n, date: trDate(), note: `Mal kabul — PO#${line.poId}`, ts: nowTs(), user: _currentUser });
    }
    if (po) {
        const poLines = state.poLines.filter((l) => String(l.poId) === String(po.id));
        const totalQty = poLines.reduce((s, l) => s + l.qty, 0);
        const totalRecv = poLines.reduce((s, l) => s + l.receivedQty, 0);
        po.status = totalRecv >= totalQty ? 'kapandi' : (totalRecv > 0 ? 'kismi' : po.status);
        po.updatedAt = nowTs();
    }
    logActivity('po-receive', item?.name ?? `satır #${lineId}`, `+${n} mal kabul (PO#${line.poId})`);
    persist();
    return { ok: true, line };
}

// ─── Cari Kartotek (partners: müşteri + tedarikçi kartları) ────────────────
// Tedarikçi kartları operasyonel = herkes okur (RLS: auth.uid() var yeter).
// Müşteri kartları CRM verisi = yalnız yönetici+satış okur (RLS emsali CRM'le
// aynı). unit_serials/getPartnerPurchaseOrders gibi talep-üzerine çekilir —
// ensureState'in toplu bulut yüklemesine dahil değil; yalnız LOKAL modda
// state.partners tutulur (bulutta her çağrı taze veri çeker).
function rowToPartner(r) {
    return {
        id: r.id, name: r.name, kind: r.kind,
        contactPerson: r.contact_person ?? '', email: r.email ?? '', phone: r.phone ?? '',
        address: r.address ?? '', country: r.country ?? '', note: r.note ?? '',
        archived: !!r.archived,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
        updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : null,
    };
}

export async function listPartners(kind, includeArchived = false) {
    if (isCloud()) {
        let q = supabase.from('partners').select('*').eq('kind', kind).order('name');
        if (!includeArchived) q = q.eq('archived', false);
        return unwrap(await q).map(rowToPartner);
    }
    await ensureState();
    return state.partners
        .filter((p) => p.kind === kind && (includeArchived || !p.archived))
        .slice().sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPartner(id) {
    if (isCloud()) {
        const row = unwrap(await supabase.from('partners').select('*').eq('id', id).maybeSingle());
        return row ? rowToPartner(row) : null;
    }
    await ensureState();
    return state.partners.find((p) => String(p.id) === String(id)) ?? null;
}

const DUP_RE = /duplicate key|already exists|23505/i;

export async function createPartner({ name, kind, contactPerson = '', email = '', phone = '', address = '', country = '', note = '' } = {}) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return { ok: false, error: 'Kart adı boş olamaz.' };
    if (!['musteri', 'tedarikci'].includes(kind)) return { ok: false, error: 'Geçersiz kart türü.' };
    const fields = {
        name: trimmed, kind,
        contact_person: contactPerson ?? '', email: email ?? '', phone: phone ?? '',
        address: address ?? '', country: country ?? '', note: note ?? '',
    };
    let partner;
    if (isCloud()) {
        try {
            partner = rowToPartner(unwrap(await supabase.from('partners').insert(fields).select().single()));
        } catch (e) {
            return { ok: false, error: DUP_RE.test(e.message) ? 'Bu isimle bir kart zaten kayıtlı.' : e.message };
        }
    } else {
        await ensureState();
        if (state.partners.some((p) => p.kind === kind && p.name.toLowerCase() === trimmed.toLowerCase())) {
            return { ok: false, error: 'Bu isimle bir kart zaten kayıtlı.' };
        }
        const maxId = state.partners.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
        partner = {
            id: maxId + 1, name: trimmed, kind, contactPerson, email, phone, address, country, note,
            archived: false, createdAt: nowTs(), updatedAt: nowTs(),
        };
        state.partners.push(partner);
    }
    logActivity('partner-add', partner.name, `yeni kart (${kind})`);
    persist();
    return { ok: true, partner };
}

export async function updatePartner(id, patch = {}) {
    const setFields = {};
    if (patch.name !== undefined) setFields.name = String(patch.name).trim();
    if (patch.contactPerson !== undefined) setFields.contact_person = patch.contactPerson ?? '';
    if (patch.email !== undefined) setFields.email = patch.email ?? '';
    if (patch.phone !== undefined) setFields.phone = patch.phone ?? '';
    if (patch.address !== undefined) setFields.address = patch.address ?? '';
    if (patch.country !== undefined) setFields.country = patch.country ?? '';
    if (patch.note !== undefined) setFields.note = patch.note ?? '';
    if (setFields.name === '') return { ok: false, error: 'Kart adı boş olamaz.' };

    if (isCloud()) {
        try {
            const row = unwrap(await supabase.from('partners').update(setFields).eq('id', id).select().single());
            const partner = rowToPartner(row);
            logActivity('partner-edit', partner.name, 'kart bilgisi güncellendi');
            return { ok: true, partner };
        } catch (e) {
            return { ok: false, error: DUP_RE.test(e.message) ? 'Bu isimle bir kart zaten kayıtlı.' : e.message };
        }
    }

    await ensureState();
    const p = state.partners.find((x) => String(x.id) === String(id));
    if (!p) return { ok: false, error: 'Kart bulunamadı.' };
    if (setFields.name && state.partners.some((x) => x !== p && x.kind === p.kind && x.name.toLowerCase() === setFields.name.toLowerCase())) {
        return { ok: false, error: 'Bu isimle bir kart zaten kayıtlı.' };
    }
    if (setFields.name) p.name = setFields.name;
    if (setFields.contact_person !== undefined) p.contactPerson = setFields.contact_person;
    if (setFields.email !== undefined) p.email = setFields.email;
    if (setFields.phone !== undefined) p.phone = setFields.phone;
    if (setFields.address !== undefined) p.address = setFields.address;
    if (setFields.country !== undefined) p.country = setFields.country;
    if (setFields.note !== undefined) p.note = setFields.note;
    p.updatedAt = nowTs();
    logActivity('partner-edit', p.name, 'kart bilgisi güncellendi');
    persist();
    return { ok: true, partner: p };
}

export async function setPartnerArchived(id, archived) {
    if (isCloud()) {
        const row = unwrap(await supabase.from('partners').update({ archived: !!archived }).eq('id', id).select().single());
        const partner = rowToPartner(row);
        logActivity(archived ? 'partner-archive' : 'partner-unarchive', partner.name,
            archived ? 'arşive taşındı' : 'arşivden geri alındı');
        return partner;
    }
    await ensureState();
    const p = state.partners.find((x) => String(x.id) === String(id));
    if (!p) return null;
    p.archived = !!archived;
    p.updatedAt = nowTs();
    logActivity(archived ? 'partner-archive' : 'partner-unarchive', p.name,
        archived ? 'arşive taşındı' : 'arşivden geri alındı');
    persist();
    return p;
}

// Tedarikçi kartına bağlı satın alma siparişleri (id/durum/satır sayısı/tarih).
export async function getPartnerPurchaseOrders(partnerId) {
    if (isCloud()) {
        const rows = unwrap(await supabase.from('purchase_orders')
            .select('*, purchase_order_lines(count)')
            .eq('partner_id', partnerId).order('created_at', { ascending: false }));
        return rows.map((r) => ({ ...rowToPo(r), lineCount: r.purchase_order_lines?.[0]?.count ?? 0 }));
    }
    await ensureState();
    return state.purchaseOrders.filter((po) => String(po.partnerId) === String(partnerId))
        .slice().sort((a, b) => b.createdAt - a.createdAt)
        .map((po) => ({ ...po, lineCount: state.poLines.filter((l) => String(l.poId) === String(po.id)).length }));
}

// ─── Hareket defteri (global activityLog) ──────────────────────────────────
export async function getActivityLog() {
    await ensureState();
    return state.activityLog.slice().sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

// Fotoğrafı olmayan bitmiş ürünler — Faz 0 çekim listesi (Salih sırayla çekecek)
export async function getMissingPhotoItems() {
    await ensureState();
    return state.items.filter((i) => i.family === 'finished' && !i.photo && !i.archived);
}

// ─── Ortak yardımcılar ─────────────────────────────────────────────────────
export function formatMoney(value, currency = 'EUR') {
    if (!value) return '—';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}
export function familyIcon(family) {
    const icons = {
        finished: '🎛️', lighting: '💡', vario: '💧', switch: '⚙️', nozzle: '💦',
        powerbox: '⚡', cable: '🔌', pano: '🗄️', motor: '🔩', pcbcard: '📟', pcbcomp: '🧮',
    };
    return icons[family] || '📦';
}
