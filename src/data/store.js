// Veri erişim katmanı — TEK giriş noktası.
// Faz 1'de bu modülün içi Supabase istemcisiyle değişecek; görünümler
// yalnızca buradaki async API'yi kullanır, veri kaynağını bilmez.
import { items, moves, productionOrders, externalProduction, crmDeals } from './sample-data.js';

const STAGE_LABELS = {
    planli: 'Planlı',
    uretimde: 'Üretimde',
    havuz_testi: 'Havuz Testi',
    bitmis: 'Bitmiş',
};

const DEAL_STAGE_LABELS = {
    lead: 'Lead',
    teklif: 'Teklif',
    muzakere: 'Müzakere',
    kazanildi: 'Kazanıldı',
};

export function stageLabel(stage) {
    return STAGE_LABELS[stage] ?? stage;
}

export function dealStageLabel(stage) {
    return DEAL_STAGE_LABELS[stage] ?? stage;
}

export function stockStatus(item) {
    if (item.qty <= item.critical) return 'critical';
    if (item.qty <= item.critical * 1.5) return 'low';
    return 'ok';
}

export async function getItems() {
    return items;
}

export async function getMoves() {
    return [...moves].sort((a, b) => b.date.localeCompare(a.date));
}

export async function getProductionOrders() {
    return productionOrders;
}

export async function getExternalProduction() {
    return externalProduction;
}

export async function getCrmDeals() {
    return crmDeals;
}

export async function getKpis() {
    const critical = items.filter((i) => stockStatus(i) === 'critical');
    const openOrders = productionOrders.filter((o) => o.stage !== 'bitmis');
    const openDeals = crmDeals.filter((d) => d.stage !== 'kazanildi');
    const pipelineValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
    return {
        totalItems: items.length,
        criticalCount: critical.length,
        openOrderCount: openOrders.length,
        openDealCount: openDeals.length,
        pipelineValue,
    };
}

export async function getCriticalItems() {
    return items
        .filter((i) => stockStatus(i) !== 'ok')
        .sort((a, b) => a.qty - a.critical - (b.qty - b.critical));
}

// Genel bakış grafiği: son 4 haftanın giriş/çıkış toplamları
export async function getWeeklyMoveTotals() {
    const weeks = [
        { label: '8–14 Haz', from: '2026-06-08', to: '2026-06-14' },
        { label: '15–21 Haz', from: '2026-06-15', to: '2026-06-21' },
        { label: '22–28 Haz', from: '2026-06-22', to: '2026-06-28' },
        { label: '29 Haz–5 Tem', from: '2026-06-29', to: '2026-07-05' },
    ];
    return weeks.map((w) => {
        const inWeek = moves.filter((m) => m.date >= w.from && m.date <= w.to);
        return {
            label: w.label,
            giris: inWeek.filter((m) => m.type === 'giris').reduce((s, m) => s + m.qty, 0),
            cikis: inWeek.filter((m) => m.type === 'cikis').reduce((s, m) => s + m.qty, 0),
        };
    });
}

export function formatMoney(value, currency = 'EUR') {
    if (!value) return '—';
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(value);
}
