// Stok grubu görünümü (finished/production/cable/pano/motor) + ürün detayı.
// Grup alt-sekmelerle gelir; kart foto-öncelikli; +/- kalıcı stok hareketi yazar.
import {
    getGroup, getStockGroup, getItemById,
    stockIn, stockOut, saveProduct, stockStatus, stockStatusLabel,
} from '../data/store.js';
import { photoUrl, placeholderHtml, statusPillClass, esc, fmtWhen, iconForFamily } from './helpers.js';
import { showToast } from '../main.js';

const MAX_RENDER = 200;          // grid'e tek seferde en çok kart
const activeSub = {};            // groupId -> seçili alt-sekme (oturumda hatırla)

function setHeader(title, subtitle) {
    document.getElementById('page-title-text').textContent = title;
    document.getElementById('page-subtitle-text').textContent = subtitle;
}

export const stockGroupView = {
    title: '', subtitle: '',
    async render(pane, { groupId }) {
        const { group, subs } = await getStockGroup(groupId);
        if (!group) { pane.innerHTML = '<p class="empty-row">Grup bulunamadı.</p>'; return; }
        setHeader(group.label, 'Foto-öncelikli ürün kataloğu ve anlık stok hareketleri.');

        if (!activeSub[groupId] || !subs.some((s) => s.key === activeSub[groupId])) {
            activeSub[groupId] = subs[0]?.key ?? null;
        }
        const multi = subs.length > 1;

        pane.innerHTML = `
            <div class="control-row">
                <div class="family-tabs" id="sub-tabs">
                    ${multi ? subs.map((s) => `
                        <button class="family-tab ${s.key === activeSub[groupId] ? 'active' : ''}" data-sub="${esc(s.key)}">
                            ${esc(s.label)} <span class="tab-count">${s.items.length}</span>
                        </button>`).join('') : ''}
                </div>
                <div class="search-box-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="stock-search" placeholder="Ürün adı veya Türkçe etiket ara...">
                </div>
            </div>
            <div class="product-grid" id="grid"></div>`;

        const grid = pane.querySelector('#grid');
        const searchInput = pane.querySelector('#stock-search');

        const draw = () => {
            const q = searchInput.value.trim().toLowerCase();
            let list;
            if (q) {
                list = subs.flatMap((s) => s.items).filter((i) =>
                    i.name.toLowerCase().includes(q) || (i.tr || '').toLowerCase().includes(q));
            } else {
                list = subs.find((s) => s.key === activeSub[groupId])?.items ?? [];
            }
            const shown = list.slice(0, MAX_RENDER);
            grid.innerHTML = shown.length
                ? shown.map(renderCard).join('') + (list.length > MAX_RENDER
                    ? `<p class="grid-more">${list.length - MAX_RENDER} kalem daha — aramayla daralt.</p>` : '')
                : '<div class="empty-state"><h3>Kayıt yok</h3></div>';
        };

        pane.querySelectorAll('#sub-tabs .family-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeSub[groupId] = btn.dataset.sub;
                pane.querySelectorAll('#sub-tabs .family-tab').forEach((b) => b.classList.toggle('active', b === btn));
                searchInput.value = '';
                draw();
            });
        });
        searchInput.addEventListener('input', draw);

        grid.addEventListener('click', async (e) => {
            const adj = e.target.closest('.btn-card-adjust');
            if (adj) {
                e.stopPropagation();
                const card = adj.closest('[data-item-id]');
                const id = card.dataset.itemId;
                const item = adj.classList.contains('adjust-plus')
                    ? await stockIn(id, 1) : await stockOut(id, 1);
                if (item) {
                    showToast(`${item.name}: stok ${item.qty}`);
                    card.outerHTML = renderCard(item);
                }
                return;
            }
            const card = e.target.closest('[data-item-id]');
            if (card) location.hash = `#/stok/urun/${card.dataset.itemId}`;
        });

        draw();
    },
};

function renderCard(p) {
    const st = stockStatus(p);
    const url = photoUrl(p);
    return `
        <div class="product-card bg-glass" data-item-id="${p.id}">
            <div class="card-img-wrap">
                ${url ? `<img src="${esc(url)}" alt="${esc(p.name)}" loading="lazy">` : placeholderHtml(p)}
                <span class="card-stock-status-pill ${statusPillClass(st)}">${stockStatusLabel(st)}</span>
            </div>
            <div class="card-body-content">
                <span class="card-family-tag">${esc(p.cat || p.family)}</span>
                <h3>${esc(p.name)}</h3>
                <div class="card-qty-row">
                    <span class="card-qty-val ${st === 'critical' ? 'text-pink' : ''}">${p.qty}</span>
                    <span class="lbl-crt">Kritik: ${p.critical}</span>
                </div>
            </div>
            <div class="card-quick-adjust-bar">
                <button class="btn-card-adjust adjust-minus" title="1 çıkış">− 1</button>
                <button class="btn-card-adjust adjust-plus" title="1 giriş">+ 1</button>
            </div>
        </div>`;
}

// ─── Ürün Detayı ───────────────────────────────────────────────────────────
export const stockDetailView = {
    title: '', subtitle: '',
    async render(pane, { id }) {
        const p = await getItemById(id);
        if (!p) { pane.innerHTML = '<p class="empty-row">Ürün bulunamadı.</p>'; return; }
        setHeader('Ürün Detayı', 'Stok hareketi (giriş/çıkış), bilgi düzenleme ve hareket geçmişi.');

        const draw = () => {
            const st = stockStatus(p);
            const url = photoUrl(p);
            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-goto="g/${groupOf(p)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Kataloğa Dön
                    </button>
                </div>
                <div class="detail-layout">
                    <div class="detail-left bg-glass">
                        <div class="detail-large-img">
                            ${url ? `<img src="${esc(url)}" alt="${esc(p.name)}">` : placeholderHtml(p, true)}
                        </div>
                        <div class="detail-quick">
                            <h2>Stok Hareketi</h2>
                            <div class="io-row">
                                <input type="number" id="io-amt" value="1" min="1" class="io-amt">
                            </div>
                            <div class="io-actions">
                                <button class="btn btn-primary" id="btn-in">▲ Giriş Yap</button>
                                <button class="btn btn-purple" id="btn-out">▼ Çıkış Yap</button>
                            </div>
                        </div>
                    </div>
                    <div class="detail-right">
                        <div class="grid-card bg-glass">
                            <span class="detail-cat-tag">${esc(p.family)}</span>
                            <h2 class="detail-name">${esc(p.name)}</h2>
                            <div class="detail-kpi-row">
                                <div class="detail-kpi"><span class="lbl">Mevcut Stok</span><span class="val mono ${st === 'critical' ? 'text-pink' : ''}">${p.qty}</span></div>
                                <div class="detail-kpi"><span class="lbl">Kritik Seviye</span><span class="val mono text-pink">${p.critical}</span></div>
                                <div class="detail-kpi"><span class="lbl">Durum</span><span class="stage-pill ${st === 'critical' ? 'stage-lost' : st === 'low' ? 'stage-prep' : 'stage-won'}">${stockStatusLabel(st)}</span></div>
                            </div>
                            <div class="detail-edit">
                                <div class="form-row-2">
                                    <div class="form-group"><label>Stok Adedi</label><input type="number" id="e-qty" value="${p.qty}"></div>
                                    <div class="form-group"><label>Kritik Seviye</label><input type="number" id="e-crt" value="${p.critical}"></div>
                                </div>
                                <div class="form-row-2">
                                    <div class="form-group"><label>Koli Adedi</label><input type="number" id="e-box" value="${p.boxQty ?? ''}"></div>
                                    <div class="form-group"><label>Ağırlık (kg)</label><input type="text" id="e-weight" value="${p.weight ?? ''}"></div>
                                </div>
                                <div class="form-group"><label>Not</label><input type="text" id="e-note" value="${esc(p.note)}"></div>
                                <div class="meta-mini">Kod/ID: #${p.id} · Arama etiketi: ${esc(p.tr || '—')}</div>
                                <button class="btn btn-primary" id="btn-save">Bilgileri Kaydet</button>
                            </div>
                        </div>
                        <div class="grid-card bg-glass margin-top-lg">
                            <div class="card-header"><h2>Hareket Geçmişi</h2><p class="card-subtitle">Bu ürünün son stok giriş/çıkışları.</p></div>
                            <div class="table-container small-table">
                                <table><thead><tr><th>Tarih</th><th>Tip</th><th>Miktar</th><th>Kullanıcı</th><th>Not</th></tr></thead>
                                <tbody>${p.history.length ? p.history.slice(0, 40).map((h) => `
                                    <tr>
                                        <td class="mono">${esc(fmtWhen(h.ts ?? h.date))}</td>
                                        <td class="${h.type === 'in' ? 'move-in' : 'move-out'}">${h.type === 'in' ? '▲ Giriş' : '▼ Çıkış'}</td>
                                        <td class="mono">${h.qty}</td>
                                        <td>${esc(h.user || '—')}</td>
                                        <td>${esc(h.note || '')}</td>
                                    </tr>`).join('') : '<tr><td colspan="5" class="empty-row">Kayıt yok — ilk giriş/çıkışta burada belirir.</td></tr>'}
                                </tbody></table>
                            </div>
                        </div>
                    </div>
                </div>`;

            const amt = () => pane.querySelector('#io-amt').value;
            pane.querySelector('#btn-in').addEventListener('click', async () => {
                await stockIn(p.id, amt()); showToast(`+${amt()} giriş: ${p.name}`); draw();
            });
            pane.querySelector('#btn-out').addEventListener('click', async () => {
                await stockOut(p.id, amt()); showToast(`−${amt()} çıkış: ${p.name}`); draw();
            });
            pane.querySelector('#btn-save').addEventListener('click', async () => {
                await saveProduct(p.id, {
                    qty: pane.querySelector('#e-qty').value,
                    critical: pane.querySelector('#e-crt').value,
                    boxQty: pane.querySelector('#e-box').value,
                    weight: pane.querySelector('#e-weight').value,
                    note: pane.querySelector('#e-note').value,
                });
                showToast('Kaydedildi.'); draw();
            });
            pane.querySelectorAll('[data-goto]').forEach((el) =>
                el.addEventListener('click', () => { location.hash = `#/${el.dataset.goto}`; }));
        };
        draw();
    },
};

// Ürünün ait olduğu üst grubu bul (geri dönüş linki için)
function groupOf(p) {
    const map = {
        finished: 'finished', lighting: 'production', vario: 'production', switch: 'production',
        nozzle: 'production', powerbox: 'production', cable: 'cable', pano: 'pano', motor: 'motor',
    };
    return map[p.family] ?? 'finished';
}
