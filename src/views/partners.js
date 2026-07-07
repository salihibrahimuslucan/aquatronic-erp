// Cari Kartotek — müşteri + tedarikçi kartları (partners).
// Tedarikçi kartı ↔ satın alma siparişi (store.js, operasyonel — her iki build
// hedefinde de mevcut). Müşteri kartı ↔ CRM fırsatı — bu köprü SATIŞ katmanı
// üzerinden (@sales alias, getPartnerDeals) çekilir; crm-store.js BURADAN
// DOĞRUDAN import EDİLMEZ (build:uretim kabul testi CRM izini pakette bulursa
// çöker — bkz. tools/build-uretim.mjs).
import {
    listPartners, getPartner, createPartner, updatePartner, setPartnerArchived,
    getPartnerPurchaseOrders, listPurchaseOrders, getCurrentRole,
} from '../data/store.js';
import { getPartnerDeals } from '@sales';
import { esc, fmtWhen } from './helpers.js';
import { showToast, salesAllowed } from '../main.js';

function setHeader(t, s) {
    document.getElementById('page-title-text').textContent = t;
    document.getElementById('page-subtitle-text').textContent = s;
}

const PO_STATUS_META = {
    taslak:  { label: 'Taslak',          cls: 'stage-await' },
    siparis: { label: 'Sipariş Verildi', cls: 'stage-prep' },
    kismi:   { label: 'Kısmi Teslim',    cls: 'outsource-status-uretimde' },
    kapandi: { label: 'Kapandı',         cls: 'stage-won' },
    iptal:   { label: 'İptal',           cls: 'stage-lost' },
};
function poStatusPill(status) {
    const m = PO_STATUS_META[status] ?? { label: status, cls: 'stage-await' };
    return `<span class="stage-pill ${m.cls}">${esc(m.label)}</span>`;
}

// ─── Basit overlay modal (purchasing.js/crm.js'teki desenle aynı ama bağımsız
// kopya — her görünüm kendi küçük yardımcısını taşır, çapraz view import yok) ─
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
        btn.disabled = true; btn.textContent = 'İşleniyor...';
        try {
            await onSubmit(overlay, close);
        } catch (err) {
            errEl.textContent = err.message ?? String(err);
            errEl.hidden = false;
        } finally {
            btn.disabled = false; btn.textContent = submitLabel;
        }
    });
    return overlay;
}

function partnerFormHtml(p = {}) {
    const f = (label, key, attrs = '') => `
        <div class="form-group"><label>${label}</label>
            <input type="text" name="${key}" value="${esc(p[key] ?? '')}" ${attrs}></div>`;
    return `
        ${f('Ad *', 'name', 'required')}
        <div class="form-row-2">${f('İlgili Kişi', 'contactPerson')}${f('Ülke', 'country')}</div>
        <div class="form-row-2">${f('E-posta', 'email', 'class="mono"')}${f('Telefon', 'phone', 'class="mono"')}</div>
        ${f('Adres', 'address')}
        <div class="form-group"><label>Not</label><textarea name="note" rows="2">${esc(p.note ?? '')}</textarea></div>`;
}
function readForm(form) {
    const out = {};
    for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) out[el.name] = el.value.trim();
    return out;
}

const KIND_LABEL = { tedarikci: 'Tedarikçi', musteri: 'Müşteri' };

// ─── Liste: #/cari — sekmeli (Tedarikçiler / Müşteriler) ───────────────────
export const partnersView = {
    title: '', subtitle: '',
    async render(pane) {
        setHeader('Cari Kartotek', 'Müşteri ve tedarikçi kartları — satın alma siparişleri ve CRM fırsatları buradan bağlanır.');
        const canSeeCustomers = salesAllowed();
        const role = getCurrentRole();
        const canWrite = { tedarikci: role === 'yonetici' || role === 'uretim', musteri: role === 'yonetici' || role === 'satis' };

        const st = { tab: 'tedarikci', showArchived: false };

        const draw = async () => {
            const [suppliers, suppliersArch, customers, customersArch] = await Promise.all([
                listPartners('tedarikci', false),
                listPartners('tedarikci', true),
                canSeeCustomers ? listPartners('musteri', false) : Promise.resolve([]),
                canSeeCustomers ? listPartners('musteri', true) : Promise.resolve([]),
            ]);
            const archivedCount = { tedarikci: suppliersArch.length - suppliers.length, musteri: customersArch.length - customers.length };

            // Bağlı iş sayıları: tedarikçi=PO sayısı (tek sorgu, N+1 yok), müşteri=fırsat sayısı.
            const poAll = await listPurchaseOrders();
            const poCount = new Map();
            for (const po of poAll) {
                if (po.partnerId == null) continue;
                poCount.set(String(po.partnerId), (poCount.get(String(po.partnerId)) || 0) + 1);
            }
            const dealCount = new Map();
            if (canSeeCustomers) {
                // Sıralı await: getCrm() önbelleği ilk çağrıda ısınır, geri kalanı
                // ağ isteği açmadan önbellekten döner (Promise.all ile paralel
                // çağrılırsa hepsi önbellek boşken aynı anda ayrı sorgu açardı).
                for (const c of customers) dealCount.set(String(c.id), (await getPartnerDeals(c.id)).length);
            }

            pane.innerHTML = `
                <div class="control-row">
                    <div class="family-tabs" id="partner-tabs">
                        <button class="family-tab ${st.tab === 'tedarikci' ? 'active' : ''}" data-tab="tedarikci">
                            Tedarikçiler <span class="tab-count">${suppliers.length}</span></button>
                        ${canSeeCustomers ? `<button class="family-tab ${st.tab === 'musteri' ? 'active' : ''}" data-tab="musteri">
                            Müşteriler <span class="tab-count">${customers.length}</span></button>` : ''}
                    </div>
                    <div class="toolbar-actions">
                        <button class="btn btn-outline btn-sm" id="btn-archive-toggle"></button>
                        <button class="btn btn-primary" id="btn-new-partner" ${canWrite[st.tab] ? '' : 'hidden'}>＋ Yeni Kart</button>
                    </div>
                </div>
                <div class="grid-card bg-glass">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Ad</th><th>İletişim</th><th>Ülke</th><th>Bağlı İş</th></tr></thead>
                            <tbody id="partner-tbody"></tbody>
                        </table>
                    </div>
                </div>`;

            const tbody = pane.querySelector('#partner-tbody');
            const archBtn = pane.querySelector('#btn-archive-toggle');

            const paint = () => {
                const list = st.tab === 'tedarikci'
                    ? (st.showArchived ? suppliersArch.filter((p) => p.archived) : suppliers)
                    : (st.showArchived ? customersArch.filter((p) => p.archived) : customers);
                const countMap = st.tab === 'tedarikci' ? poCount : dealCount;
                archBtn.textContent = st.showArchived ? '← Aktif Kartlar' : `Arşiv (${archivedCount[st.tab]})`;
                archBtn.disabled = !st.showArchived && archivedCount[st.tab] <= 0;
                pane.querySelector('#btn-new-partner').hidden = !canWrite[st.tab];

                tbody.innerHTML = list.length ? list.map((p) => `
                    <tr data-partner-row="${p.id}" style="cursor:pointer">
                        <td class="strong">${esc(p.name)} ${p.archived ? '<span class="badge badge-muted">Arşivde</span>' : ''}</td>
                        <td>${esc(p.contactPerson || '—')}${p.phone ? ' · <span class="mono">' + esc(p.phone) + '</span>' : ''}</td>
                        <td>${esc(p.country || '—')}</td>
                        <td class="mono">${countMap.get(String(p.id)) ?? 0}</td>
                    </tr>`).join('')
                    : `<tr><td colspan="4" class="empty-row">${st.showArchived ? 'Arşivde kart yok.' : 'Henüz kart yok.'}</td></tr>`;

                tbody.querySelectorAll('[data-partner-row]').forEach((tr) => {
                    tr.addEventListener('click', () => { location.hash = `#/cari/kart/${tr.dataset.partnerRow}`; });
                });
            };
            paint();

            pane.querySelectorAll('#partner-tabs .family-tab').forEach((btn) => {
                btn.addEventListener('click', () => {
                    st.tab = btn.dataset.tab; st.showArchived = false;
                    pane.querySelectorAll('#partner-tabs .family-tab').forEach((b) => b.classList.toggle('active', b === btn));
                    paint();
                });
            });
            archBtn.addEventListener('click', () => { st.showArchived = !st.showArchived; paint(); });

            pane.querySelector('#btn-new-partner').addEventListener('click', () => {
                const kind = st.tab;
                openModal({
                    title: `Yeni ${KIND_LABEL[kind]} Kartı`,
                    submitLabel: 'Kartı Oluştur',
                    bodyHtml: partnerFormHtml(),
                    onSubmit: async (overlay, close) => {
                        const d = readForm(overlay.querySelector('.modal-form'));
                        const res = await createPartner({ ...d, kind });
                        if (!res.ok) throw new Error(res.error);
                        showToast(`Kart oluşturuldu: ${res.partner.name}`);
                        close();
                        draw();
                    },
                });
            });
        };
        await draw();
    },
};

// ─── Detay: #/cari/kart/:id ─────────────────────────────────────────────────
export const partnerDetailView = {
    title: '', subtitle: '',
    async render(pane, { id }) {
        setHeader('Cari Kart', 'Kart bilgisi ve bağlı işler.');

        const draw = async () => {
            const partner = await getPartner(id);
            if (!partner) { pane.innerHTML = '<p class="empty-row">Kart bulunamadı.</p>'; return; }
            if (partner.kind === 'musteri' && !salesAllowed()) {
                pane.innerHTML = '<p class="empty-row">Bu karta erişim yetkiniz yok.</p>'; return;
            }
            const role = getCurrentRole();
            const canWrite = partner.kind === 'tedarikci'
                ? (role === 'yonetici' || role === 'uretim')
                : (role === 'yonetici' || role === 'satis');

            const linked = partner.kind === 'tedarikci'
                ? await getPartnerPurchaseOrders(partner.id)
                : await getPartnerDeals(partner.id);

            const linkedHtml = partner.kind === 'tedarikci'
                ? (linked.length ? `<div class="table-container"><table>
                        <thead><tr><th>PO#</th><th>Durum</th><th>Satır</th><th>Tarih</th></tr></thead>
                        <tbody>${linked.map((po) => `
                            <tr data-po="${po.id}" style="cursor:pointer">
                                <td class="mono strong">PO#${po.id}</td>
                                <td>${poStatusPill(po.status)}</td>
                                <td class="mono">${po.lineCount}</td>
                                <td class="mono" style="font-size:0.75rem">${esc(fmtWhen(po.createdAt))}</td>
                            </tr>`).join('')}</tbody>
                    </table></div>` : '<p class="empty-row">Bu tedarikçiye ait sipariş yok.</p>')
                : (linked.length ? `<div class="table-container"><table>
                        <thead><tr><th>Fırsat</th><th>Stage</th><th>Son Temas</th></tr></thead>
                        <tbody>${linked.map((d) => `
                            <tr data-deal="${esc(d.id)}" style="cursor:pointer">
                                <td class="mono strong">${esc(d.id)} <span class="text-muted">— ${esc(d.company)}${d.project ? ' · ' + esc(d.project) : ''}</span></td>
                                <td><span class="stage-pill stage-await">${esc(d.stage || '—')}</span></td>
                                <td class="mono">${esc(d.lastContact || '—')}</td>
                            </tr>`).join('')}</tbody>
                    </table></div>` : '<p class="empty-row">Bu müşteriye bağlı CRM fırsatı yok.</p>');

            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-goto="cari">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Cari Kartotek'e Dön
                    </button>
                    <span class="badge badge-muted">${KIND_LABEL[partner.kind]}</span>
                    ${partner.archived ? '<span class="stage-pill stage-lost">Arşivde</span>' : ''}
                    <span class="detail-actions-right">
                        ${canWrite ? `<button class="btn btn-outline" id="btn-edit-partner">✎ Düzenle</button>
                        <button class="btn btn-outline" id="btn-toggle-archive">${partner.archived ? '↺ Arşivden Geri Al' : '🗄 Arşivle'}</button>` : ''}
                    </span>
                </div>

                <div class="detail-layout">
                    <div class="detail-left bg-glass">
                        <h2 class="deal-company">${esc(partner.name)}</h2>
                        <div class="deal-meta-grid">
                            <div class="meta-item"><strong>İlgili Kişi</strong><span>${esc(partner.contactPerson || '—')}</span></div>
                            <div class="meta-item"><strong>E-posta</strong><span class="mono">${esc(partner.email || '—')}</span></div>
                            <div class="meta-item"><strong>Telefon</strong><span class="mono">${esc(partner.phone || '—')}</span></div>
                            <div class="meta-item"><strong>Ülke</strong><span>${esc(partner.country || '—')}</span></div>
                            <div class="meta-item"><strong>Adres</strong><span>${esc(partner.address || '—')}</span></div>
                        </div>
                        ${partner.note ? `<div class="deal-latest"><strong>Not</strong><p>${esc(partner.note)}</p></div>` : ''}
                    </div>
                    <div class="detail-right">
                        <div class="grid-card bg-glass">
                            <div class="card-header">
                                <h2>${partner.kind === 'tedarikci' ? '🧾 Satın Alma Siparişleri' : '📈 CRM Fırsatları'} <span class="count-chip">${linked.length}</span></h2>
                            </div>
                            ${linkedHtml}
                        </div>
                    </div>
                </div>`;

            pane.querySelectorAll('[data-po]').forEach((tr) => {
                tr.addEventListener('click', () => { location.hash = `#/satinalma/po/${tr.dataset.po}`; });
            });
            pane.querySelectorAll('[data-deal]').forEach((tr) => {
                tr.addEventListener('click', () => { location.hash = `#/crm/deal/${tr.dataset.deal}`; });
            });
            pane.querySelector('[data-goto]')?.addEventListener('click', (e) => {
                location.hash = `#/${e.currentTarget.dataset.goto}`;
            });
            pane.querySelector('#btn-edit-partner')?.addEventListener('click', () => {
                openModal({
                    title: `${KIND_LABEL[partner.kind]} Kartını Düzenle`,
                    submitLabel: 'Kaydet',
                    bodyHtml: partnerFormHtml(partner),
                    onSubmit: async (overlay, close) => {
                        const d = readForm(overlay.querySelector('.modal-form'));
                        const res = await updatePartner(partner.id, d);
                        if (!res.ok) throw new Error(res.error);
                        showToast('Kart güncellendi.');
                        close();
                        draw();
                    },
                });
            });
            pane.querySelector('#btn-toggle-archive')?.addEventListener('click', async () => {
                await setPartnerArchived(partner.id, !partner.archived);
                showToast(partner.archived ? `Geri alındı: ${partner.name}` : `Arşivlendi: ${partner.name}`);
                draw();
            });
        };
        await draw();
    },
};
