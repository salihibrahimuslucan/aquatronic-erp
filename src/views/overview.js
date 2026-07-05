// Genel Bakış — 4 KPI + kritik stok tablosu (v2 kalıbı; chart YOK, sade).
import { getKpis, getCriticalItems, stockStatus, stockStatusLabel } from '../data/store.js';
import { photoUrl, iconForFamily, statusPillClass, esc } from './helpers.js';

const MAX_CRITICAL_ROWS = 14;
const FAMILY_LABEL = {
    finished: 'Bitmiş', lighting: 'Aydınlatma', vario: 'Vario', switch: 'Switch',
    nozzle: 'Nozul', powerbox: 'PowerBOX', cable: 'Kablo & Soket', pano: 'Pano / PSU', motor: 'Motor',
};

export const overviewView = {
    title: 'Genel Bakış',
    subtitle: 'Aquatronic üretim, stok ve teklif kontrol arayüzü.',

    async render(pane) {
        const [kpis, critical] = await Promise.all([getKpis(), getCriticalItems()]);

        pane.innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-cyan">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Toplam Ürün Çeşidi</h3>
                        <p class="kpi-value mono">${kpis.totalItems}</p>
                        <span class="kpi-sub">Kayıtlı stok kalemi</span>
                    </div>
                </div>
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-pink">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Kritik Stok Seviyesi</h3>
                        <p class="kpi-value mono text-pink">${kpis.criticalCount}</p>
                        <span class="kpi-sub text-pink">Limit altındaki kalemler</span>
                    </div>
                </div>
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-purple">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Aktif Üretim</h3>
                        <p class="kpi-value mono">${kpis.activeCount}</p>
                        <span class="kpi-sub">Şu an üretimdeki iş emirleri</span>
                    </div>
                </div>
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-green">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Açık Satış Fırsatı</h3>
                        <p class="kpi-value mono">${kpis.openOpportunityCount ?? '—'}</p>
                        <span class="kpi-sub">CRM modülünde takipte</span>
                    </div>
                </div>
            </div>

            <div class="grid-card bg-glass margin-top-lg">
                <div class="card-header flex-row">
                    <div>
                        <h2>⚠️ Kritik Stok Alarmı Veren Ürünler</h2>
                        <p class="card-subtitle">Mevcut miktarı kritik asgari seviyenin altına düşen kalemler (en kötüden başlayarak ilk ${MAX_CRITICAL_ROWS}).</p>
                    </div>
                    <button class="btn btn-outline" data-goto="g/finished">Tüm Envanteri Gör</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Ürün Resmi</th>
                                <th>Ürün Adı</th>
                                <th>Ürün Ailesi</th>
                                <th>Mevcut Adet</th>
                                <th>Kritik Limit</th>
                                <th>Stok Durumu</th>
                                <th>Notlar</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${critical.length === 0
                                ? '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Kritik seviye altına düşen ürün yok.</td></tr>'
                                : critical.slice(0, MAX_CRITICAL_ROWS).map((p) => {
                                    const st = stockStatus(p);
                                    const url = photoUrl(p);
                                    return `
                                    <tr data-item-id="${p.id}" style="cursor:pointer">
                                        <td class="table-thumbnail-cell">
                                            ${url
                                                ? `<img src="${esc(url)}" class="table-thumb" alt="${esc(p.name)}" loading="lazy">`
                                                : `<span class="table-placeholder-ico">${iconForFamily(p.family)}</span>`}
                                        </td>
                                        <td style="font-weight:600;color:#fff">${esc(p.name)}</td>
                                        <td class="mono" style="font-size:0.75rem">${esc(FAMILY_LABEL[p.family] ?? p.family)}</td>
                                        <td class="table-qty-val text-pink">${p.qty}</td>
                                        <td class="table-qty-val" style="color:var(--text-secondary)">${p.critical}</td>
                                        <td><span class="card-stock-status-pill ${statusPillClass(st)}" style="position:static">${stockStatusLabel(st)}</span></td>
                                        <td style="color:var(--text-secondary);font-size:0.75rem;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.note || '—')}</td>
                                    </tr>`;
                                }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;

        // Satıra tıkla -> ürün detayı
        pane.querySelectorAll('tr[data-item-id]').forEach((tr) => {
            tr.addEventListener('click', () => { location.hash = `#/stok/urun/${tr.dataset.itemId}`; });
        });
    },
};
