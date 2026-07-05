import { getProductionOrders, getExternalProduction, stageLabel } from '../data/store.js';

const STAGES = ['planli', 'uretimde', 'havuz_testi', 'bitmis'];

const EXT_STATUS = {
    gonderildi: '<span class="stock-badge stock-low">Gönderildi</span>',
    uretimde: '<span class="stock-badge stock-ok">Üretimde</span>',
    teslim_alindi: '<span class="stock-badge stock-ok">Teslim Alındı</span>',
};

export const productionView = {
    id: 'uretim',
    title: 'Üretim',
    headerAction: 'Yeni Üretim Emri',

    async render(root) {
        const [orders, external] = await Promise.all([
            getProductionOrders(), getExternalProduction(),
        ]);

        root.innerHTML = `
            <div class="view-header">
                <div>
                    <h1>Üretim</h1>
                    <p>Üretim emirleri akışı ve dış üretim takibi.</p>
                </div>
            </div>

            <div class="kanban-board">
                ${STAGES.map((stage) => {
                    const inStage = orders.filter((o) => o.stage === stage);
                    return `
                    <div class="kanban-column bg-glass kanban-col-${stage}">
                        <div class="kanban-column-header">
                            <h3>${stageLabel(stage)}</h3>
                            <span class="kanban-count">${inStage.length}</span>
                        </div>
                        ${inStage.map((o) => `
                            <div class="order-card">
                                <div class="order-card-top">
                                    <span class="order-id">${o.id}</span>
                                    <span class="order-qty">×${o.qty}</span>
                                </div>
                                <div class="order-product">${o.product}</div>
                                <div class="order-meta">
                                    <span>${o.project}</span>
                                    <span class="mono">${o.due}</span>
                                </div>
                            </div>`).join('')
                            || '<p style="color:var(--text-muted);font-size:0.8rem">Emir yok.</p>'}
                    </div>`;
                }).join('')}
            </div>

            <h2 class="section-title">Dış Üretim
                <span class="card-subtitle">Fason iş emirleri — Ömer Kablo</span>
            </h2>
            <div class="grid-card bg-glass">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>Emir</th><th>Tedarikçi</th><th>Kalem</th><th>Adet</th><th>Gönderim</th><th>Termin</th><th>Durum</th></tr>
                        </thead>
                        <tbody>
                            ${external.map((e) => `
                                <tr>
                                    <td class="mono">${e.id}</td>
                                    <td>${e.partner}</td>
                                    <td>${e.item}</td>
                                    <td class="mono">${e.qty}</td>
                                    <td class="mono">${e.sentDate}</td>
                                    <td class="mono">${e.dueDate}</td>
                                    <td>${EXT_STATUS[e.status] ?? e.status}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    },
};
