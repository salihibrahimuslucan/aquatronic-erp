import { getCrmDeals, dealStageLabel, formatMoney } from '../data/store.js';

const STAGES = ['lead', 'teklif', 'muzakere', 'kazanildi'];

export const crmView = {
    id: 'crm',
    title: 'CRM',
    headerAction: 'Yeni Fırsat',

    async render(root) {
        const deals = await getCrmDeals();

        root.innerHTML = `
            <div class="view-header">
                <div>
                    <h1>CRM</h1>
                    <p>Satış hattı — fırsat kartları aşamalara göre.</p>
                </div>
            </div>

            <div class="pipeline-board">
                ${STAGES.map((stage) => {
                    const inStage = deals.filter((d) => d.stage === stage);
                    const total = inStage.reduce((s, d) => s + (d.value || 0), 0);
                    return `
                    <div class="kanban-column bg-glass pipeline-col-${stage}">
                        <div class="kanban-column-header">
                            <div>
                                <h3>${dealStageLabel(stage)}</h3>
                                <span class="pipeline-total">${total ? formatMoney(total) : ''}</span>
                            </div>
                            <span class="kanban-count">${inStage.length}</span>
                        </div>
                        ${inStage.map((d) => `
                            <div class="order-card">
                                <div class="order-card-top">
                                    <span class="order-id">${d.id}</span>
                                    <span class="order-qty mono">${d.date}</span>
                                </div>
                                <div class="deal-company">${d.company}</div>
                                <div class="deal-country">${d.country}</div>
                                <div class="deal-subject">${d.subject}</div>
                                <div class="deal-value">${formatMoney(d.value, d.currency)}</div>
                                <div class="deal-last-action">${d.lastAction}</div>
                            </div>`).join('')
                            || '<p style="color:var(--text-muted);font-size:0.8rem">Kayıt yok.</p>'}
                    </div>`;
                }).join('')}
            </div>`;
    },
};
