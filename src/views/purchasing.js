// Satın Alma-Lite — kritik stok → tedarikçi bazlı sipariş önerisi → taslak PO →
// siparişe çevir → mal kabul (receive_po_line RPC → apply_stock_move ledger'a yazar).
// Operasyonel modül: CRM'den bağımsız, her iki build hedefinde de mevcut
// (src/sales/* ALIAS'ına DOKUNMAZ — bkz. build:uretim kabul testi).
import {
    getCriticalSuggestion, listPurchaseOrders, getPurchaseOrder, createPurchaseOrder,
    convertPoToOrder, cancelPo, receivePoLine, stockStatus,
} from '../data/store.js';
import { esc, fmtWhen, photoUrl, placeholderHtml } from './helpers.js';
import { showToast } from '../main.js';

const PO_STATUS_META = {
    taslak:  { label: 'Taslak',          cls: 'stage-await' },
    siparis: { label: 'Sipariş Verildi', cls: 'stage-prep' },
    kismi:   { label: 'Kısmi Teslim',    cls: 'outsource-status-uretimde' },
    kapandi: { label: 'Kapandı',         cls: 'stage-won' },
    iptal:   { label: 'İptal',           cls: 'stage-lost' },
};
function statusPill(status) {
    const m = PO_STATUS_META[status] ?? { label: status, cls: 'stage-await' };
    return `<span class="stage-pill ${m.cls}">${esc(m.label)}</span>`;
}
const OPEN_STATUSES = ['taslak', 'siparis', 'kismi'];

function setHeader(t, s) {
    document.getElementById('page-title-text').textContent = t;
    document.getElementById('page-subtitle-text').textContent = s;
}

// ─── Küçük ikonlar (main.js ICON deseniyle aynı stroke stili) ──────────────
const ICO_CART = '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>';
const ICO_WARN = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>';
const ICO_Q = '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>';
function ico(path) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// ─── Basit overlay modal (crm.js'teki desenle aynı ama bağımsız kopya —
// purchasing.js src/sales'e bağlanmamalı) ───────────────────────────────────
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

// ─── Ana sayfa: KPI + Sipariş Önerisi + Siparişler tablosu ─────────────────
export const purchasingView = {
    title: '', subtitle: '',
    async render(pane) {
        setHeader('Satın Alma', 'Kritik stok → tedarikçi bazlı sipariş önerisi → sipariş kaydı → mal kabul.');

        const draw = async () => {
            const [groups, orders] = await Promise.all([getCriticalSuggestion(), listPurchaseOrders()]);
            const openOrders = orders.filter((o) => OPEN_STATUSES.includes(o.status));
            const criticalCount = groups.reduce((n, g) => n + g.items.length, 0);
            const unknownGroup = groups.find((g) => !g.supplier);
            const unknownCount = unknownGroup?.items.length ?? 0;

            pane.innerHTML = `
                <div class="kpi-grid">
                    <div class="grid-card bg-glass kpi-card">
                        <div class="kpi-icon icon-cyan">${ico(ICO_CART)}</div>
                        <div class="kpi-info"><h3>Açık Sipariş</h3><span class="kpi-value">${openOrders.length}</span>
                        <span class="kpi-sub">taslak + sipariş + kısmi teslim</span></div>
                    </div>
                    <div class="grid-card bg-glass kpi-card">
                        <div class="kpi-icon icon-pink">${ico(ICO_WARN)}</div>
                        <div class="kpi-info"><h3>Kritik Altı Kalem</h3><span class="kpi-value">${criticalCount}</span>
                        <span class="kpi-sub">stok ≤ kritik seviye</span></div>
                    </div>
                    <div class="grid-card bg-glass kpi-card">
                        <div class="kpi-icon icon-purple">${ico(ICO_Q)}</div>
                        <div class="kpi-info"><h3>Tedarikçi Belirsiz</h3><span class="kpi-value">${unknownCount}</span>
                        <span class="kpi-sub">kritik + tedarikçi atanmamış</span></div>
                    </div>
                </div>

                <div class="grid-card bg-glass">
                    <div class="card-header">
                        <h2>📦 Sipariş Önerisi <span class="count-chip">${criticalCount}</span></h2>
                        <p class="card-subtitle">Kritik altı kalemler tedarikçiye göre gruplu. Önerilen adet = kritik×2 − mevcut stok
                        (alt sınır 1) — satırda düzenlenebilir.</p>
                    </div>
                    ${groups.length
                        ? groups.map((g, gi) => renderSupplierGroup(g, gi)).join('')
                        : '<div class="empty-state"><h3>Kritik altı kalem yok — stoklar yeterli. 🎉</h3></div>'}
                </div>

                <div class="grid-card bg-glass margin-top-lg">
                    <div class="card-header"><h2>🧾 Siparişler <span class="count-chip">${orders.length}</span></h2>
                    <p class="card-subtitle">Taslak, verilmiş ve kapanmış tüm satın alma siparişleri.</p></div>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>PO#</th><th>Tedarikçi</th><th>Durum</th><th>Satır</th><th>Tarih</th></tr></thead>
                            <tbody>${orders.length ? orders.map(renderOrderRow).join('')
                                : '<tr><td colspan="5" class="empty-row">Henüz sipariş yok.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>`;

            // Grup satırları: tekli qty değişince "seçili toplam" güncellensin diye
            // özel bir hesap yok — gönderirken DOM'dan doğrudan okunuyor.
            pane.querySelectorAll('[data-po-group]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const gi = btn.dataset.poGroup;
                    const group = groups[Number(gi)];
                    const rows = [...pane.querySelectorAll(`[data-sg-row="${gi}"]`)]
                        .filter((r) => r.querySelector('.sg-chk').checked)
                        .map((r) => ({ itemId: Number(r.dataset.itemId), qty: r.querySelector('.sg-qty').value }));
                    if (!rows.length) { showToast('En az bir kalem seçin.'); return; }

                    if (group.supplier) {
                        const res = await createPurchaseOrder(group.supplier, rows);
                        if (!res.ok) { showToast(res.error); return; }
                        showToast(`Taslak sipariş oluşturuldu: PO#${res.po.id} (${group.supplier})`);
                        draw();
                        return;
                    }
                    // Tedarikçi belirsiz grup — önce tedarikçi adı iste.
                    openModal({
                        title: 'Tedarikçi Belirle ve Sipariş Oluştur',
                        submitLabel: 'Taslak Sipariş Oluştur',
                        bodyHtml: `
                            <p class="modal-hint">${rows.length} kalem seçildi — bu siparişin gideceği tedarikçiyi yazın.</p>
                            <div class="form-group"><label>Tedarikçi *</label>
                                <input type="text" name="supplier" required placeholder="ör. Mean Well, Delta, Danfoss..."></div>`,
                        onSubmit: async (overlay, close) => {
                            const supplier = overlay.querySelector('input[name=supplier]').value.trim();
                            if (!supplier) throw new Error('Tedarikçi adı boş olamaz.');
                            const res = await createPurchaseOrder(supplier, rows);
                            if (!res.ok) throw new Error(res.error);
                            showToast(`Taslak sipariş oluşturuldu: PO#${res.po.id} (${supplier})`);
                            close();
                            draw();
                        },
                    });
                });
            });

            pane.querySelectorAll('[data-po-row]').forEach((tr) => {
                tr.addEventListener('click', () => { location.hash = `#/satinalma/po/${tr.dataset.poRow}`; });
            });
        };
        await draw();
    },
};

function renderSupplierGroup(g, gi) {
    return `
        <div class="grid-section">
            <div class="card-header flex-row" style="margin-bottom:10px">
                <h3 class="grid-section-title" style="margin:0">${g.supplier ? esc(g.supplier) : '⚠ Tedarikçi belirsiz'}
                    <span class="tab-count">${g.items.length}</span></h3>
                <button class="btn btn-primary btn-sm" data-po-group="${gi}">
                    ${g.supplier ? 'Bu tedarikçiye sipariş oluştur' : 'Tedarikçi belirle ve sipariş oluştur'}</button>
            </div>
            <div class="table-container small-table" style="max-height:420px;overflow-y:auto">
                <table>
                    <thead><tr><th></th><th>Ürün</th><th>Stok</th><th>Kritik</th><th>Önerilen Sipariş</th></tr></thead>
                    <tbody>${g.items.map((it) => `
                        <tr data-sg-row="${gi}" data-item-id="${it.id}">
                            <td><input type="checkbox" class="sg-chk" checked></td>
                            <td class="strong">${esc(it.name)}</td>
                            <td class="mono text-pink">${it.qty}</td>
                            <td class="mono">${it.critical}</td>
                            <td><input type="number" class="sg-qty" min="1" value="${it.suggestedQty}" style="width:80px"></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function renderOrderRow(o) {
    return `
        <tr data-po-row="${o.id}" style="cursor:pointer">
            <td class="mono strong">PO#${o.id}</td>
            <td>${esc(o.supplier || '—')}</td>
            <td>${statusPill(o.status)}</td>
            <td class="mono">${o.lineCount}</td>
            <td class="mono" style="font-size:0.75rem">${esc(fmtWhen(o.createdAt))}</td>
        </tr>`;
}

// ─── PO Detay ───────────────────────────────────────────────────────────────
export const purchaseOrderView = {
    title: '', subtitle: '',
    async render(pane, { id }) {
        setHeader('Sipariş Detayı', 'Sipariş satırları, mal kabul ve durum yönetimi.');

        const draw = async () => {
            const res = await getPurchaseOrder(id);
            if (!res) { pane.innerHTML = '<p class="empty-row">Sipariş bulunamadı.</p>'; return; }
            const { po, lines } = res;

            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-goto="satinalma">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Satın Alma'ya Dön
                    </button>
                </div>
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div>
                            <h2>PO#${po.id} — ${esc(po.supplier)} ${statusPill(po.status)}</h2>
                            <p class="card-subtitle">${esc(fmtWhen(po.createdAt))} ${po.note ? '· ' + esc(po.note) : ''}</p>
                        </div>
                        <div class="toolbar-actions">
                            ${po.status === 'taslak' ? '<button class="btn btn-primary btn-sm" id="btn-po-convert">Taslağı Siparişe Çevir</button>' : ''}
                            ${!['kapandi', 'iptal'].includes(po.status) ? '<button class="btn btn-outline btn-sm" id="btn-po-cancel">İptal Et</button>' : ''}
                        </div>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead><tr><th></th><th>Kalem</th><th>İstenen</th><th>Gelen</th><th>Kalan</th><th>Stok</th><th></th></tr></thead>
                            <tbody>${lines.length ? lines.map(renderLineRow).join('')
                                : '<tr><td colspan="7" class="empty-row">Bu siparişte satır yok.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>`;

            pane.querySelector('[data-goto]')?.addEventListener('click', (e) => {
                location.hash = `#/${e.currentTarget.dataset.goto}`;
            });
            pane.querySelector('#btn-po-convert')?.addEventListener('click', async () => {
                await convertPoToOrder(po.id);
                showToast('Sipariş verildi olarak işaretlendi.');
                draw();
            });
            pane.querySelector('#btn-po-cancel')?.addEventListener('click', async () => {
                if (!confirm(`PO#${po.id} iptal edilsin mi?`)) return;
                await cancelPo(po.id);
                showToast('Sipariş iptal edildi.');
                draw();
            });
            pane.querySelectorAll('[data-receive]').forEach((btn) => btn.addEventListener('click', () => {
                const line = lines.find((l) => String(l.id) === String(btn.dataset.receive));
                openReceiveModal(line, async () => { draw(); });
            }));
        };
        await draw();
    },
};

function renderLineRow(l) {
    const item = l.item;
    const remaining = Math.max(0, l.qty - l.receivedQty);
    const url = item ? photoUrl(item) : null;
    const st = item ? stockStatus(item) : null;
    return `
        <tr>
            <td class="table-thumbnail-cell">
                ${item ? (url ? `<img class="table-thumb" src="${esc(url)}" alt="${esc(item.name)}">` : placeholderHtml(item))
                    : '<span class="table-placeholder-ico">📦</span>'}
            </td>
            <td class="strong">${esc(item?.name ?? `Silinmiş kalem (#${l.itemId})`)}</td>
            <td class="mono">${l.qty}</td>
            <td class="mono text-cyan">${l.receivedQty}</td>
            <td class="mono ${remaining > 0 ? 'text-pink' : ''}">${remaining}</td>
            <td class="mono">${item ? `${item.qty} <span style="color:var(--text-muted)">/ ${item.critical}</span>${st === 'critical' ? ' ⚠' : ''}` : '—'}</td>
            <td>${remaining > 0 ? `<button class="btn btn-outline btn-sm" data-receive="${l.id}">Mal Kabul</button>` : '<span class="stage-pill stage-won">Tam</span>'}</td>
        </tr>`;
}

function openReceiveModal(line, onDone) {
    const remaining = Math.max(0, line.qty - line.receivedQty);
    openModal({
        title: `Mal Kabul — ${line.item?.name ?? '#' + line.itemId}`,
        submitLabel: 'Mal Kabulü İşle',
        bodyHtml: `
            <p class="modal-hint">İstenen: ${line.qty} · Gelen: ${line.receivedQty} · Kalan: ${remaining}.
            Kabul edilen miktar items.qty'ye eklenir ve Hareket Defteri'ne "Mal kabul — PO#${line.poId}" olarak yazılır.</p>
            <div class="form-group"><label>Kabul Edilen Miktar *</label>
                <input type="number" name="qty" min="1" value="${remaining || 1}" required></div>`,
        onSubmit: async (overlay, close) => {
            const qty = overlay.querySelector('input[name=qty]').value;
            const res = await receivePoLine(line.id, qty);
            if (!res.ok) throw new Error(res.error);
            showToast(`Mal kabul işlendi: +${qty} (${line.item?.name ?? '#' + line.itemId})`);
            close();
            onDone();
        },
    });
}
