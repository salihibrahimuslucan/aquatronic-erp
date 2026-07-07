// Raporlar Paneli — yönetici özeti (salt-okuma). Üç bölüm: Kritik Stok,
// Aylık Üretim Özeti, CRM Hunisi. Yeni tablo/mutasyon YOK; mevcut veri
// fonksiyonlarından okur. CRM Hunisi @sales köprüsünden gelir → build:uretim
// paketinde funnel/müşteri verisi HİÇ bulunmaz (getFunnelSummary null döner ve
// bölüm hiç render edilmez; ayrıca üretim rolünde salesAllowed() false).
import { getCriticalSuggestion, getProductionMonthlySummary } from '../data/store.js';
import { getFunnelSummary, renderFunnelCard } from '@sales';
import { esc, iconForFamily } from './helpers.js';
import { salesAllowed } from '../main.js';

function setHeader(t, s) {
    document.getElementById('page-title-text').textContent = t;
    document.getElementById('page-subtitle-text').textContent = s;
}

// ── Kritik Stok tablosu ────────────────────────────────────────────────────
function renderCriticalCard(groups) {
    // Tedarikçiye gruplu öneriyi tek listeye düz → en kritikler üstte
    // (stok/eşik oranı en düşük olan; 0 stok en tepede).
    const items = groups.flatMap((g) => g.items.map((it) => ({ ...it, supplierLabel: g.label })));
    items.sort((a, b) => {
        const ra = a.critical > 0 ? a.qty / a.critical : a.qty;
        const rb = b.critical > 0 ? b.qty / b.critical : b.qty;
        return ra - rb || b.critical - a.critical;
    });
    const rows = items.length ? items.map((it) => `
        <tr>
            <td class="strong">${iconForFamily(it.family)} ${esc(it.name)}</td>
            <td class="mono text-pink">${it.qty}</td>
            <td class="mono">${it.critical}</td>
            <td class="mono">${Math.max(0, it.critical - it.qty)}</td>
            <td>${esc(it.supplierLabel)}</td>
        </tr>`).join('')
        : '<tr><td colspan="5" class="empty-row">Kritik altı kalem yok — stoklar yeterli. 🎉</td></tr>';

    return `
        <div class="grid-card bg-glass">
            <div class="card-header">
                <h2>⚠ Kritik Stok <span class="count-chip">${items.length}</span></h2>
                <p class="card-subtitle">Stok ≤ kritik eşik olan kalemler; en kritik olan üstte. Eksik = eşik − mevcut.</p>
            </div>
            <div class="table-container" style="max-height:420px;overflow-y:auto">
                <table>
                    <thead><tr><th>Kalem</th><th>Mevcut</th><th>Kritik Eşik</th><th>Eksik</th><th>Tedarikçi</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

// ── Aylık Üretim Özeti tablosu ─────────────────────────────────────────────
function renderMonthlyCard(months) {
    const totalOrders = months.reduce((s, m) => s + m.orderCount, 0);
    const totalQty = months.reduce((s, m) => s + m.totalQty, 0);
    const rows = months.length ? months.map((m) => `
        <tr>
            <td class="strong">${esc(m.label)}</td>
            <td class="mono">${m.orderCount}</td>
            <td class="mono text-cyan">${m.totalQty}</td>
        </tr>`).join('')
        : '<tr><td colspan="3" class="empty-row">Tamamlanmış üretim kaydı yok.</td></tr>';

    return `
        <div class="grid-card bg-glass margin-top-lg">
            <div class="card-header">
                <h2>🏭 Aylık Üretim Özeti <span class="count-chip">${months.length}</span></h2>
                <p class="card-subtitle">Tamamlanan üretim emirleri, aya göre (en yeni ay üstte, en fazla 6 ay).</p>
            </div>
            <div class="table-container">
                <table>
                    <thead><tr><th>Ay</th><th>Emir Sayısı</th><th>Toplam Adet</th></tr></thead>
                    <tbody>${rows}</tbody>
                    ${months.length ? `<tfoot><tr>
                        <td class="strong">Toplam</td>
                        <td class="mono strong">${totalOrders}</td>
                        <td class="mono strong text-cyan">${totalQty}</td>
                    </tr></tfoot>` : ''}
                </table>
            </div>
        </div>`;
}

// CRM Hunisi kartı @sales'ten gelir (renderFunnelCard); build:uretim'de stub ''
// döner ve funnel zaten null olur → "CRM" izi üretim paketine hiç girmez.

export const reportsView = {
    title: 'Raporlar',
    subtitle: 'Yönetici özeti',
    async render(pane) {
        setHeader('Raporlar', 'Yönetici özeti — kritik stok ve üretim göstergeleri.');

        const [groups, months] = await Promise.all([
            getCriticalSuggestion(),
            getProductionMonthlySummary(),
        ]);

        // CRM hunisi yalnız satış görebilen roller için (üretim rolü + build:uretim
        // paketi funnel null döner → bölüm hiç çizilmez).
        let funnel = null;
        if (salesAllowed()) {
            funnel = await getFunnelSummary();
        }

        pane.innerHTML = `
            ${renderCriticalCard(groups)}
            ${renderMonthlyCard(months)}
            ${funnel ? renderFunnelCard(funnel) : ''}`;
    },
};
