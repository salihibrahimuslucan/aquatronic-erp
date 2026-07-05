// CRM görünümleri — Google Sheets CRM v4'ün birebir aynası.
// Pipeline: 16 kolon (LEAD / STATUS / MONEY-SHIP / FOLLOW-UP grup başlıkları, R2 kolon adları)
// Deal View: kart + Activity Log timeline'ı · Activity Log: 8 kolon.
import {
    getCrm, getDealById, getDealActivities,
    normalizeStage, parseCrmDate, parseCrmMoney, isOverdue,
} from '../data/store.js';

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Sheet'teki Stage pastel paleti -> neon-dark tema karşılıkları
const STAGE_CLASS = {
    'New / Inquiry': 'stage-new',
    'Offer to Prepare': 'stage-prep',
    'Offer Sent': 'stage-sent',
    'In Review / Negotiation': 'stage-review',
    'Awaiting Reply': 'stage-await',
    'Won / Agreed': 'stage-won',
    'Payment Received': 'stage-paid',
    'In Production': 'stage-prod',
    'Shipped / Delivered': 'stage-shipped',
    'Lost / Rejected': 'stage-lost',
    'Completed': 'stage-won',
};

function stagePill(stage) {
    const s = normalizeStage(stage);
    if (!s) return '<span class="text-muted">—</span>';
    return `<span class="stage-pill ${STAGE_CLASS[s] ?? 'stage-await'}">${esc(s)}</span>`;
}

function moneyCell(v) {
    return `<td class="mono money-cell">${esc(v || '—')}</td>`;
}

// Sheet kuralı: Latest punchline >120 karakter -> soft kırmızı uyarı
function latestCell(v) {
    const over = (v ?? '').length > 120 ? ' punchline-over' : '';
    return `<td class="latest-cell${over}" title="${esc(v)}">${esc(v || '—')}</td>`;
}

function dirChip(direction) {
    const d = (direction ?? '').toLowerCase();
    if (d.startsWith('in')) return '<span class="dir-chip dir-in">▼ Inbound</span>';
    if (d.startsWith('out')) return '<span class="dir-chip dir-out">▲ Outbound</span>';
    return `<span class="dir-chip">${esc(direction || '—')}</span>`;
}

const TAB_DEFS = [
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'completed', label: 'Completed' },
    { key: 'lost', label: 'Lost - Rejected' },
];

// ---------------------------------------------------------------- Pipeline

export const crmPipelineView = {
    title: 'CRM Pipeline',
    subtitle: 'Google Sheets CRM v4 aynası — satır tıkla: Deal View.',

    async render(pane) {
        const crm = await getCrm();
        const state = { tab: 'pipeline', q: '', stage: '', owner: '' };

        const pipelineTotal = crm.pipeline
            .map((d) => parseCrmMoney(d.dealValue))
            .filter((n) => n !== null)
            .reduce((a, b) => a + b, 0);
        const overdueCount = crm.pipeline.filter((d) => isOverdue(d.nextDate)).length;

        const stageOptions = (crm.lists.Stage ?? [])
            .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
        const ownerOptions = (crm.lists.Owner ?? [])
            .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');

        pane.innerHTML = `
            <div class="crm-kpi-row">
                <div class="crm-kpi bg-glass"><span class="lbl">Aktif Fırsat</span><span class="val mono">${crm.pipeline.length}</span></div>
                <div class="crm-kpi bg-glass"><span class="lbl">Deal $ Toplamı (dolu kayıtlar)</span><span class="val mono">${pipelineTotal.toLocaleString('tr-TR')}</span></div>
                <div class="crm-kpi bg-glass ${overdueCount ? 'kpi-warn' : ''}"><span class="lbl">Vadesi Geçmiş Takip</span><span class="val mono">${overdueCount}</span></div>
                <div class="crm-kpi bg-glass"><span class="lbl">Tamamlanan / Kayıp</span><span class="val mono">${crm.completed.length} / ${crm.lost.length}</span></div>
            </div>

            <div class="control-row">
                <div class="family-tabs" id="crm-tabs">
                    ${TAB_DEFS.map((t) => `
                        <button class="family-tab ${t.key === 'pipeline' ? 'active' : ''}" data-tab="${t.key}">
                            ${t.label} <span class="tab-count">${crm[t.key].length}</span>
                        </button>`).join('')}
                </div>
                <div class="crm-filters">
                    <select id="crm-filter-stage"><option value="">Tüm Stage'ler</option>${stageOptions}</select>
                    <select id="crm-filter-owner"><option value="">Tüm Owner'lar</option>${ownerOptions}</select>
                    <div class="search-box-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="text" id="crm-search" placeholder="ID, şirket, proje veya kişi ara...">
                    </div>
                </div>
            </div>

            <div class="grid-card bg-glass">
                <div class="table-container crm-table-wrap">
                    <table class="crm-table">
                        <thead>
                            <tr class="group-header">
                                <th colspan="7" class="grp grp-lead">LEAD</th>
                                <th colspan="2" class="grp grp-status">STATUS</th>
                                <th colspan="3" class="grp grp-money">MONEY-SHIP</th>
                                <th colspan="4" class="grp grp-follow">FOLLOW-UP</th>
                            </tr>
                            <tr>
                                <th>ID</th><th>Company</th><th>Project</th><th>Country</th>
                                <th>Contact</th><th>Email</th><th>Product</th>
                                <th>Owner</th><th>Stage</th>
                                <th>Deal $</th><th>Paid $</th><th>Shipping</th>
                                <th>Last Contact</th><th>Next Action</th><th>Next Date</th><th>Latest</th>
                            </tr>
                        </thead>
                        <tbody id="crm-tbody"></tbody>
                    </table>
                </div>
                <p class="crm-footnote">Anlık görüntü: ${esc(crm.fetchedAt ?? '—')} · Canlı kaynak Google Sheets; Faz 1'de Supabase'e taşınacak.</p>
            </div>`;

        const tbody = pane.querySelector('#crm-tbody');

        const applyFilters = () => {
            const deals = crm[state.tab].filter((d) => {
                if (state.stage && normalizeStage(d.stage) !== normalizeStage(state.stage)) return false;
                if (state.owner && d.owner !== state.owner) return false;
                if (state.q) {
                    const hay = `${d.id} ${d.company} ${d.project} ${d.contact} ${d.email} ${d.product}`.toLowerCase();
                    if (!hay.includes(state.q)) return false;
                }
                return true;
            });

            tbody.innerHTML = deals.length ? deals.map((d) => `
                <tr class="crm-row" data-deal="${esc(d.id)}">
                    <td class="mono deal-id">${esc(d.id)}</td>
                    <td class="strong">${esc(d.company)}</td>
                    <td title="${esc(d.project)}">${esc(d.project)}</td>
                    <td>${esc(d.country || '—')}</td>
                    <td title="${esc(d.contact)}">${esc(d.contact || '—')}</td>
                    <td class="mono email-cell" title="${esc(d.email)}">${esc(d.email || '—')}</td>
                    <td title="${esc(d.product)}">${esc(d.product || '—')}</td>
                    <td>${esc(d.owner || '—')}</td>
                    <td>${stagePill(d.stage)}</td>
                    ${moneyCell(d.dealValue)}${moneyCell(d.paidValue)}
                    <td class="ship-cell" title="${esc(d.shipping)}">${esc(d.shipping || '—')}</td>
                    <td class="mono">${esc(d.lastContact || '—')}</td>
                    <td>${esc(d.nextAction || '—')}</td>
                    <td class="mono ${state.tab === 'pipeline' && isOverdue(d.nextDate) ? 'date-overdue' : ''}">${esc(d.nextDate || '—')}</td>
                    ${latestCell(d.latest)}
                </tr>`).join('')
                : '<tr><td colspan="16" class="empty-row">Filtreyle eşleşen kayıt yok.</td></tr>';

            tbody.querySelectorAll('.crm-row').forEach((row) => {
                row.addEventListener('click', () => { location.hash = `#/crm/deal/${row.dataset.deal}`; });
            });
        };

        pane.querySelectorAll('#crm-tabs .family-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.tab = btn.dataset.tab;
                pane.querySelectorAll('#crm-tabs .family-tab').forEach((b) => b.classList.toggle('active', b === btn));
                applyFilters();
            });
        });
        pane.querySelector('#crm-search').addEventListener('input', (e) => {
            state.q = e.target.value.trim().toLowerCase(); applyFilters();
        });
        pane.querySelector('#crm-filter-stage').addEventListener('change', (e) => {
            state.stage = e.target.value; applyFilters();
        });
        pane.querySelector('#crm-filter-owner').addEventListener('change', (e) => {
            state.owner = e.target.value; applyFilters();
        });

        applyFilters();
    },
};

// ---------------------------------------------------------------- Deal View

const CARD_FIELDS = [
    ['Company', 'company'], ['Project', 'project'], ['Country', 'country'],
    ['Contact', 'contact'], ['Email', 'email'], ['Product', 'product'],
    ['Owner', 'owner'], ['Deal $', 'dealValue'], ['Paid $', 'paidValue'],
    ['Shipping', 'shipping'], ['Last Contact', 'lastContact'],
    ['Next Action', 'nextAction'], ['Next Date', 'nextDate'],
];

export const crmDealView = {
    title: 'Deal View',
    subtitle: 'Fırsat kartı + aktivite timeline\'ı (Sheets Deal View aynası).',

    async render(pane, params) {
        const deal = await getDealById(params.id);
        if (!deal) {
            pane.innerHTML = `<div class="grid-card bg-glass"><p class="empty-row">Deal bulunamadı: ${esc(params.id)}</p>
                <button class="btn btn-outline" data-goto="crm">Pipeline'a Dön</button></div>`;
            return;
        }
        const activities = await getDealActivities(deal.id);
        const sourceLabel = { pipeline: 'Pipeline', completed: 'Completed (arşiv)', lost: 'Lost - Rejected (arşiv)' }[deal.source];

        pane.innerHTML = `
            <div class="detail-actions">
                <button class="btn btn-outline" data-goto="crm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    Pipeline'a Dön
                </button>
                <span class="badge badge-muted">${esc(sourceLabel)}</span>
            </div>

            <div class="detail-layout">
                <div class="detail-left bg-glass">
                    <div class="deal-card-head">
                        <span class="mono deal-id-big">${esc(deal.id)}</span>
                        ${stagePill(deal.stage)}
                    </div>
                    <h2 class="deal-company">${esc(deal.company)}</h2>
                    <p class="deal-project">${esc(deal.project || '')}</p>

                    <div class="deal-meta-grid">
                        ${CARD_FIELDS.map(([label, key]) => `
                            <div class="meta-item">
                                <strong>${label}</strong>
                                <span class="${['dealValue', 'paidValue', 'lastContact', 'nextDate', 'email'].includes(key) ? 'mono' : ''} ${key === 'nextDate' && deal.source === 'pipeline' && isOverdue(deal.nextDate) ? 'date-overdue' : ''}">${esc(deal[key] || '—')}</span>
                            </div>`).join('')}
                    </div>

                    <div class="deal-latest ${(deal.latest ?? '').length > 120 ? 'punchline-over' : ''}">
                        <strong>Latest</strong>
                        <p>${esc(deal.latest || '—')}</p>
                    </div>
                </div>

                <div class="detail-right">
                    <div class="grid-card bg-glass">
                        <div class="card-header">
                            <h2>Aktivite Timeline</h2>
                            <p class="card-subtitle">Activity Log'dan bu deal'e ait kayıtlar — yeniden eskiye.</p>
                        </div>
                        <div class="timeline">
                            ${activities.length ? activities.map((a) => `
                                <div class="timeline-entry">
                                    <div class="timeline-date mono">${esc(a.date)}</div>
                                    <div class="timeline-body">
                                        <div class="timeline-meta">
                                            ${dirChip(a.direction)}
                                            <span class="chan-chip">${esc(a.channel || '—')}</span>
                                            ${a.by ? `<span class="by-chip">${esc(a.by)}</span>` : ''}
                                        </div>
                                        <p>${esc(a.summary)}</p>
                                    </div>
                                </div>`).join('')
                                : '<p class="empty-row">Bu deal için log kaydı yok.</p>'}
                        </div>
                    </div>
                </div>
            </div>`;
    },
};

// ------------------------------------------------------------- Activity Log

export const crmLogView = {
    title: 'Aktivite Günlüğü',
    subtitle: 'CRM Activity Log aynası — tüm deal temasları, yeniden eskiye.',

    async render(pane) {
        const crm = await getCrm();
        const state = { q: '', dir: '' };

        const entries = [...crm.activityLog].sort((a, b) =>
            (parseCrmDate(b.date)?.getTime() ?? 0) - (parseCrmDate(a.date)?.getTime() ?? 0));

        pane.innerHTML = `
            <div class="control-row">
                <div class="crm-filters">
                    <select id="log-filter-dir">
                        <option value="">Tüm Yönler</option>
                        <option value="Inbound">Inbound</option>
                        <option value="Outbound">Outbound</option>
                    </select>
                    <div class="search-box-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="text" id="log-search" placeholder="Deal ID, şirket veya özet ara...">
                    </div>
                </div>
            </div>

            <div class="grid-card bg-glass">
                <div class="table-container">
                    <table class="crm-table">
                        <thead>
                            <tr>
                                <th>Date</th><th>Deal ID</th><th>Company</th><th>Contact</th>
                                <th>Direction</th><th>Channel</th><th>Summary</th><th>By</th>
                            </tr>
                        </thead>
                        <tbody id="log-tbody"></tbody>
                    </table>
                </div>
                <p class="crm-footnote">${entries.length} kayıt · Anlık görüntü: ${esc(crm.fetchedAt ?? '—')}</p>
            </div>`;

        const tbody = pane.querySelector('#log-tbody');
        const applyFilters = () => {
            const rows = entries.filter((a) => {
                if (state.dir && (a.direction ?? '') !== state.dir) return false;
                if (state.q) {
                    const hay = `${a.dealId} ${a.company} ${a.contact} ${a.summary}`.toLowerCase();
                    if (!hay.includes(state.q)) return false;
                }
                return true;
            });
            tbody.innerHTML = rows.length ? rows.map((a) => `
                <tr>
                    <td class="mono">${esc(a.date)}</td>
                    <td class="mono"><a class="deal-link" href="#/crm/deal/${esc(a.dealId)}">${esc(a.dealId)}</a></td>
                    <td class="strong">${esc(a.company)}</td>
                    <td>${esc(a.contact || '—')}</td>
                    <td>${dirChip(a.direction)}</td>
                    <td>${esc(a.channel || '—')}</td>
                    <td class="latest-cell ${(a.summary ?? '').length > 120 ? 'punchline-over' : ''}" title="${esc(a.summary)}">${esc(a.summary)}</td>
                    <td>${esc(a.by || '—')}</td>
                </tr>`).join('')
                : '<tr><td colspan="8" class="empty-row">Filtreyle eşleşen kayıt yok.</td></tr>';
        };

        pane.querySelector('#log-search').addEventListener('input', (e) => {
            state.q = e.target.value.trim().toLowerCase(); applyFilters();
        });
        pane.querySelector('#log-filter-dir').addEventListener('change', (e) => {
            state.dir = e.target.value; applyFilters();
        });
        applyFilters();
    },
};
