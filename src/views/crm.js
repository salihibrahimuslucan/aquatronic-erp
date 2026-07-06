// CRM görünümleri — Google Sheets CRM v4'ün birebir aynası.
// Pipeline: 16 kolon (LEAD / STATUS / MONEY-SHIP / FOLLOW-UP grup başlıkları, R2 kolon adları)
// Deal View: kart + Activity Log timeline'ı · Activity Log: 8 kolon.
import {
    getCrm, getDealById, getDealActivities,
    normalizeStage, parseCrmDate, parseCrmMoney, isOverdue,
    crmAddDeal, crmUpdateDeal, crmAddActivity,
} from '../data/crm-store.js';
import { getItems, createOrderFromDeal, getOrdersForDeal } from '../data/store.js';
import { showToast } from '../main.js';

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

// ------------------------------------------------------------ Form modalları

function today() {
    const d = new Date();
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function selectOptions(list, selected) {
    return ['<option value=""></option>', ...(list ?? []).map((v) =>
        `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`)].join('');
}

// Overlay modal iskeleti: kapatma (X / overlay / Esc) + submit hatasını inline gösterir.
function openModal({ title, bodyHtml, submitLabel, onSubmit }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-panel bg-glass">
            <div class="modal-head">
                <h2>${esc(title)}</h2>
                <button class="modal-close" title="Kapat">✕</button>
            </div>
            <form class="modal-form">${bodyHtml}
                <p class="modal-error" hidden></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline modal-cancel">Vazgeç</button>
                    <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);

    const form = overlay.querySelector('.modal-form');
    const errEl = overlay.querySelector('.modal-error');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Kaydediliyor…'; errEl.hidden = true;
        try {
            await onSubmit(form, close);
        } catch (err) {
            errEl.textContent = err.message; errEl.hidden = false;
            btn.disabled = false; btn.textContent = submitLabel;
        }
    });
    return overlay;
}

// 16 kolonluk fırsat formu — ekleme ve düzenleme aynı iskelet.
function dealFormHtml(d, lists, { lockId = false, withLog = false } = {}) {
    const f = (label, key, attrs = '') => `
        <div class="form-group"><label>${label}</label>
            <input type="text" name="${key}" value="${esc(d[key] ?? '')}" ${attrs}></div>`;
    return `
        <div class="form-row-2">
            ${f('ID *', 'id', lockId ? 'readonly class="mono locked"' : 'required placeholder="örn. DEMFT-1" class="mono"')}
            ${f('Company *', 'company', 'required')}
        </div>
        ${f('Project', 'project')}
        <div class="form-row-2">${f('Country', 'country')}${f('Contact', 'contact')}</div>
        <div class="form-row-2">${f('Email', 'email', 'class="mono"')}${f('Product', 'product')}</div>
        <div class="form-row-2">
            <div class="form-group"><label>Owner</label>
                <select name="owner">${selectOptions(lists.Owner, d.owner)}</select></div>
            <div class="form-group"><label>Stage</label>
                <select name="stage">${selectOptions(lists.Stage, normalizeStage(d.stage))}</select></div>
        </div>
        <div class="form-row-2">${f('Deal $', 'dealValue', 'class="mono"')}${f('Paid $', 'paidValue', 'class="mono"')}</div>
        ${f('Shipping', 'shipping')}
        <div class="form-row-2">
            ${f('Last Contact', 'lastContact', 'placeholder="gg.aa.yyyy" class="mono"')}
            ${f('Next Date', 'nextDate', 'placeholder="gg.aa.yyyy" class="mono"')}
        </div>
        <div class="form-group"><label>Next Action</label>
            <select name="nextAction">${selectOptions(lists['Next Action'], d.nextAction)}</select></div>
        <div class="form-group"><label>Latest <span class="hint">(punchline, ≤120 önerilir)</span></label>
            <textarea name="latest" rows="2">${esc(d.latest ?? '')}</textarea></div>
        ${withLog ? `<div class="form-group"><label>Açılış log kaydı <span class="hint">(opsiyonel — Activity Log'a da yazılır)</span></label>
            <input type="text" name="logSummary"></div>` : ''}`;
}

function readForm(form) {
    const out = {};
    for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
        out[el.name] = el.value.trim();
    }
    return out;
}

function openDealModal({ mode, deal = {}, lists, onDone }) {
    const add = mode === 'add';
    const overlay = openModal({
        title: add ? 'Yeni Fırsat — Pipeline\'a eklenir' : `Fırsatı Düzenle — ${deal.id}`,
        submitLabel: add ? 'Sheet\'e Ekle' : 'Sheet\'te Güncelle',
        bodyHtml: dealFormHtml(add ? { lastContact: today() } : deal, lists,
            { lockId: !add, withLog: add }),
        async onSubmit(form, close) {
            const d = readForm(form);
            if (add) await crmAddDeal(d);
            else await crmUpdateDeal(deal.id, d);
            close(); onDone();
        },
    });
    if (add) {
        // Kolaylık: şirket yazılınca boş ID için sheet düzenine uygun öneri üret
        const idEl = overlay.querySelector('input[name=id]');
        overlay.querySelector('input[name=company]').addEventListener('blur', (e) => {
            if (!idEl.value.trim() && e.target.value.trim()) {
                idEl.value = `${e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase()}-1`;
            }
        });
    }
}

function openActivityModal({ deal, lists, onDone }) {
    openModal({
        title: `Aktivite Ekle — ${deal.id}`,
        submitLabel: 'Log\'a Yaz',
        bodyHtml: `
            <div class="form-row-2">
                <div class="form-group"><label>Date</label>
                    <input type="text" name="date" value="${today()}" class="mono"></div>
                <div class="form-group"><label>By</label>
                    <select name="by">${selectOptions(lists.Owner, 'Salih')}</select></div>
            </div>
            <div class="form-row-2">
                <div class="form-group"><label>Direction</label>
                    <select name="direction">${selectOptions(lists.Direction?.length ? lists.Direction : ['Inbound', 'Outbound'], 'Outbound')}</select></div>
                <div class="form-group"><label>Channel</label>
                    <select name="channel">${selectOptions(lists.Channel?.length ? lists.Channel : ['Email', 'Phone', 'WhatsApp', 'Meeting'], 'Email')}</select></div>
            </div>
            <div class="form-group"><label>Summary *</label>
                <textarea name="summary" rows="3" required></textarea></div>
            ${deal.source === 'pipeline' ? `<label class="check-line">
                <input type="checkbox" name="updateLatest" checked>
                Pipeline satırında Latest + Last Contact'ı da güncelle</label>` : ''}`,
        async onSubmit(form, close) {
            const d = readForm(form);
            d.dealId = deal.id;
            d.updateLatest = form.querySelector('[name=updateLatest]')?.checked ?? false;
            await crmAddActivity(d);
            close(); onDone();
        },
    });
}

// Faz 2 köprüsü: fırsatı planlı üretim emrine çevir. Ürün kataloğundan kalem +
// adet seçilir; not şirket/proje ile ön-doldurulur (üretim ekibinin gördüğü
// operasyonel bağlam — fiyat/iletişim CRM'de kalır).
function openConvertModal({ deal, items, onDone }) {
    const noteDefault = `${deal.company}${deal.project ? ' · ' + deal.project : ''}`;
    // Fırsatın ürün metnine en yakın katalog kalemini ön-seç
    const wanted = (deal.product ?? '').toLowerCase();
    const preselect = wanted
        ? (items.find((i) => i.name.toLowerCase() === wanted)
            ?? items.find((i) => wanted && i.name.toLowerCase().includes(wanted.split(/\s+/)[0]))) : null;
    openModal({
        title: `Üretime Aktar — ${deal.id}`,
        submitLabel: 'Planlı Emir Aç',
        bodyHtml: `
            <p class="modal-hint">Fırsat planlı üretim emrine dönüşür; üretim ekibi Planlı Üretim'den "Üretime Al" ile başlatır.</p>
            <div class="form-group"><label>Ürün *</label>
                <select name="product" required>${items.map((i) =>
                    `<option ${preselect && i.name === preselect.name ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></div>
            <div class="form-row-2">
                <div class="form-group"><label>Adet *</label>
                    <input type="number" name="qty" value="1" min="1" required class="mono"></div>
                <div class="form-group"><label>Fırsat ürünü (metin)</label>
                    <input type="text" value="${esc(deal.product || '—')}" readonly class="locked"></div>
            </div>
            <div class="form-group"><label>Not <span class="hint">(üretim ekibi görür)</span></label>
                <input type="text" name="note" value="${esc(noteDefault)}"></div>`,
        async onSubmit(form, close) {
            const d = readForm(form);
            const item = items.find((i) => i.name === d.product);
            const order = await createOrderFromDeal({
                dealId: deal.id, itemId: item?.id ?? null, productName: d.product,
                qty: d.qty, note: d.note,
            });
            // CRM izini bırak: aktivite + (pipeline'sa) Latest güncelle
            try {
                await crmAddActivity({
                    dealId: deal.id, date: today(), company: deal.company, contact: deal.contact,
                    direction: 'Outbound', channel: 'ERP', by: deal.owner,
                    summary: `Üretime aktarıldı — planlı emir #${order.id} · ${d.product} ×${d.qty}`,
                    updateLatest: deal.source === 'pipeline',
                });
            } catch { /* aktivite yazımı başarısızsa emir yine de açıldı */ }
            close();
            showToast(`Planlı emir açıldı: ${d.product} ×${d.qty}`);
            onDone();
        },
    });
}

// Bağlı üretim emri durumu → pil sınıfı + etiket + hedef görünüm
const ORDER_STATUS = {
    planned: { label: 'Planlı', cls: 'stage-await', goto: 'g/planned' },
    active: { label: 'Üretimde', cls: 'stage-prod', goto: 'g/active' },
    done: { label: 'Tamamlandı', cls: 'stage-won', goto: 'g/active' },
};

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
                    <button class="btn btn-primary" id="btn-new-deal" ${crm.live ? '' : 'disabled title="CRM yazma API\'si kapalı — python tools/crm_api.py çalıştır"'}>＋ Yeni Fırsat</button>
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
                <p class="crm-footnote">
                    <span class="live-dot ${crm.live ? 'on' : ''}"></span>
                    ${crm.live ? `Canlı Google Sheet — ${esc(crm.fetchedAt)}` : `Salt-okur snapshot: ${esc(crm.fetchedAt ?? '—')} — yazma için: python tools/crm_api.py`}
                </p>
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
        pane.querySelector('#btn-new-deal').addEventListener('click', () => {
            openDealModal({ mode: 'add', lists: crm.lists, onDone: () => this.render(pane) });
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
        const crm = await getCrm();
        const deal = await getDealById(params.id);
        if (!deal) {
            pane.innerHTML = `<div class="grid-card bg-glass"><p class="empty-row">Deal bulunamadı: ${esc(params.id)}</p>
                <button class="btn btn-outline" data-goto="crm">Pipeline'a Dön</button></div>`;
            return;
        }
        const activities = await getDealActivities(deal.id);
        const linkedOrders = await getOrdersForDeal(deal.id);
        const sourceLabel = { pipeline: 'Pipeline', completed: 'Completed (arşiv)', lost: 'Lost - Rejected (arşiv)' }[deal.source];
        const writeOff = crm.live ? '' : 'disabled title="CRM yazma API\'si kapalı — python tools/crm_api.py çalıştır"';
        // Kayıp fırsatta üretime aktarma anlamsız
        const canConvert = deal.source !== 'lost';

        pane.innerHTML = `
            <div class="detail-actions">
                <button class="btn btn-outline" data-goto="crm">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    Pipeline'a Dön
                </button>
                <span class="badge badge-muted">${esc(sourceLabel)}</span>
                <span class="detail-actions-right">
                    ${deal.source === 'pipeline' ? `<button class="btn btn-outline" id="btn-edit-deal" ${writeOff}>✎ Düzenle</button>` : ''}
                    ${canConvert ? `<button class="btn btn-outline" id="btn-convert" ${writeOff}>🏭 Üretime Aktar</button>` : ''}
                    <button class="btn btn-primary" id="btn-add-activity" ${writeOff}>＋ Aktivite Ekle</button>
                </span>
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

                    ${linkedOrders.length ? `<div class="deal-orders">
                        <strong>Bağlı Üretim Emirleri <span class="count-chip">${linkedOrders.length}</span></strong>
                        <div class="deal-orders-list">${linkedOrders.map((o) => {
                            const s = ORDER_STATUS[o.status] ?? ORDER_STATUS.planned;
                            return `<a class="deal-order-row" href="#/${s.goto}">
                                <span class="mono">#${esc(o.id)}</span>
                                <span class="deal-order-name">${esc(o.name)} <span class="mono">×${esc(o.qty)}</span></span>
                                <span class="stage-pill ${s.cls}">${s.label}</span></a>`;
                        }).join('')}</div>
                    </div>` : ''}
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

        const rerender = () => this.render(pane, params);
        pane.querySelector('#btn-edit-deal')?.addEventListener('click', () => {
            openDealModal({ mode: 'edit', deal, lists: crm.lists, onDone: rerender });
        });
        pane.querySelector('#btn-convert')?.addEventListener('click', async () => {
            const items = await getItems();
            openConvertModal({ deal, items, onDone: rerender });
        });
        pane.querySelector('#btn-add-activity').addEventListener('click', () => {
            openActivityModal({ deal, lists: crm.lists, onDone: rerender });
        });
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
