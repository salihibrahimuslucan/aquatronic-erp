// Stok Kartları — v2 foto-öncelikli grid + family sekmeleri + arama.
// 542 ürün: DOM'a yalnız seçili sekmenin (veya arama sonucunun) kartları basılır.
import {
    getItems, getItemById, getTabs, adjustItemStock,
    stockStatus, stockStatusLabel,
} from '../data/store.js';
import { photoUrl, placeholderHtml, iconForFamily, statusPillClass, esc, fmtWhen } from './helpers.js';
import { showToast } from '../main.js';

const MAX_SEARCH_RESULTS = 120;

// Oturum içinde sekme seçimi hatırlansın (görünüme geri dönünce aynı sekme).
let activeTabKey = null;

// ---------------------------------------------------------------------------
// LİSTE GÖRÜNÜMÜ  (#/stok)
// ---------------------------------------------------------------------------
export const stockListView = {
    title: 'Stok Kartları',
    subtitle: 'Foto-öncelikli ürün kataloğu ve anlık miktar kontrolleri.',

    async render(pane) {
        const [items, tabs] = await Promise.all([getItems(), getTabs()]);
        if (!activeTabKey || !tabs.some((t) => t.key === activeTabKey)) {
            // Foto-öncelikli vitrin: ilk açılış Bitmiş Ürünler sekmesi
            activeTabKey = tabs.some((t) => t.key === 'finished') ? 'finished' : (tabs[0]?.key ?? null);
        }

        pane.innerHTML = `
            <div class="control-row">
                <div class="family-tabs" id="family-tabs-bar"></div>
                <div class="search-box-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="input-stock-search" placeholder="Ürün adı veya Türkçe etiket ara...">
                </div>
            </div>
            <div class="product-grid" id="product-cards-grid"></div>`;

        const tabsBar = pane.querySelector('#family-tabs-bar');
        const grid = pane.querySelector('#product-cards-grid');
        const searchInput = pane.querySelector('#input-stock-search');

        const renderTabs = () => {
            tabsBar.innerHTML = tabs.map((t) => `
                <button class="family-tab ${t.key === activeTabKey ? 'active' : ''}" data-tab="${esc(t.key)}">
                    ${esc(t.label)}<span class="tab-count">${t.count ?? ''}</span>
                </button>`).join('');
        };

        const visibleItems = () => {
            const q = searchInput.value.trim().toLowerCase();
            if (q) {
                // Arama tüm sekmelerde name + tr alanında çalışır.
                return {
                    list: items.filter((i) =>
                        (i.name || '').toLowerCase().includes(q) || (i.tr || '').toLowerCase().includes(q),
                    ),
                    searching: true,
                };
            }
            return { list: items.filter((i) => i.family === activeTabKey), searching: false };
        };

        const renderGrid = () => {
            const { list, searching } = visibleItems();
            const capped = list.slice(0, searching ? MAX_SEARCH_RESULTS : list.length);

            if (capped.length === 0) {
                grid.innerHTML = `<div class="empty-state"><h3>Aranan kriterlere uygun ürün kartı bulunamadı.</h3></div>`;
                return;
            }

            grid.innerHTML = capped.map((p) => renderCard(p)).join('')
                + (list.length > capped.length
                    ? `<div class="empty-state"><h3>${list.length - capped.length} sonuç daha var — aramayı daralt.</h3></div>`
                    : '');
        };

        renderTabs();
        renderGrid();

        // Sekme tıklama
        tabsBar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-tab]');
            if (!btn) return;
            activeTabKey = btn.dataset.tab;
            searchInput.value = '';
            renderTabs();
            renderGrid();
        });

        // Arama
        searchInput.addEventListener('input', renderGrid);

        // Grid delegasyonu: +/- hızlı ayar ve kart tıklaması (detaya git)
        grid.addEventListener('click', async (e) => {
            const adjustBtn = e.target.closest('.btn-card-adjust');
            if (adjustBtn) {
                e.stopPropagation();
                const card = adjustBtn.closest('[data-item-id]');
                const delta = adjustBtn.classList.contains('adjust-plus') ? 1 : -1;
                const item = await adjustItemStock(card.dataset.itemId, delta);
                if (item) {
                    showToast(`${item.name}: yeni stok ${item.qty} — hareket Faz 1'de (Supabase) kalıcılaşacak, şimdilik oturum içi.`);
                    // Yalnız ilgili kartı tazele
                    card.outerHTML = renderCard(item);
                }
                return;
            }
            const card = e.target.closest('[data-item-id]');
            if (card) location.hash = `#/stok/urun/${card.dataset.itemId}`;
        });
    },
};

function renderCard(p) {
    const st = stockStatus(p);
    const url = photoUrl(p);
    return `
        <div class="product-card bg-glass" data-item-id="${p.id}">
            <div class="card-img-wrap">
                ${url
                    ? `<img src="${esc(url)}" alt="${esc(p.name)}" loading="lazy">`
                    : placeholderHtml(p)}
                <span class="card-stock-status-pill ${statusPillClass(st)}">${stockStatusLabel(st)}</span>
            </div>
            <div class="card-body-content">
                <span class="card-family-tag">${esc(p.family)}</span>
                <h3>${esc(p.name)}</h3>
                <div class="card-qty-row">
                    <span class="card-qty-val ${st === 'critical' ? 'text-pink' : ''}">${p.qty}</span>
                    <span class="lbl-crt">Kritik: ${p.critical}</span>
                </div>
            </div>
            <div class="card-quick-adjust-bar">
                <button class="btn-card-adjust adjust-minus" title="1 azalt">− 1</button>
                <button class="btn-card-adjust adjust-plus" title="1 artır">+ 1</button>
            </div>
        </div>`;
}

// ---------------------------------------------------------------------------
// DETAY GÖRÜNÜMÜ  (#/stok/urun/<id>)
// ---------------------------------------------------------------------------
export const stockDetailView = {
    title: 'Ürün Detay Sayfası',
    subtitle: 'Model özellikleri, stok hareket günlüğü ve sayım ayarı.',

    async render(pane, params) {
        const item = await getItemById(params.id);
        if (!item) {
            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-goto="stok">← Kartlara Dön</button>
                </div>
                <div class="grid-card bg-glass empty-state"><h3>Ürün bulunamadı (ID: ${esc(params.id)}).</h3></div>`;
            return;
        }
        const tabs = await getTabs();
        const familyLabel = tabs.find((t) => t.key === item.family)?.label ?? item.family;

        const draw = () => {
            const st = stockStatus(item);
            const url = photoUrl(item);
            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-back-to-stock>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Kartlara Dön
                    </button>
                </div>

                <div class="detail-layout">
                    <div class="detail-left bg-glass">
                        <div class="detail-large-img-container">
                            ${url ? `<img src="${esc(url)}" alt="${esc(item.name)}">` : placeholderHtml(item, true)}
                        </div>
                        <div class="detail-quick-controls">
                            <h2>Hızlı Stok Güncelleme</h2>
                            <p>Fiziki sayım farkını doğrudan işlemek için kullanın. Kalıcı kayıt Faz 1'de (Supabase) — şimdilik oturum içi.</p>
                            <div class="adjust-box">
                                <button class="btn-adjust minus" data-qty-minus>−</button>
                                <input type="number" class="input-qty-number" data-qty-input value="1" min="1">
                                <button class="btn-adjust plus" data-qty-plus>+</button>
                            </div>
                            <div class="adjust-actions">
                                <button class="btn btn-primary" data-save-in>Stok Girişi Yap</button>
                                <button class="btn btn-purple" data-save-out>Stok Çıkışı Yap</button>
                            </div>
                        </div>
                    </div>

                    <div class="detail-right">
                        <div class="grid-card bg-glass">
                            <div class="card-header">
                                <span class="detail-cat-tag">${esc(familyLabel)}</span>
                                <h2>${esc(item.name)}</h2>
                                <div class="detail-kpi-row">
                                    <div class="detail-kpi">
                                        <span class="lbl">Mevcut Stok</span>
                                        <span class="val">${item.qty}</span>
                                    </div>
                                    <div class="detail-kpi">
                                        <span class="lbl">Kritik Seviye</span>
                                        <span class="val text-pink">${item.critical}</span>
                                    </div>
                                    <div class="detail-kpi">
                                        <span class="lbl">Stok Sağlığı</span>
                                        <span class="card-stock-status-pill ${statusPillClass(st)}" style="position:static;align-self:flex-start">${stockStatusLabel(st)}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="detail-meta-list">
                                <div class="meta-item"><strong>Özel Not:</strong><span>${esc(item.note || '—')}</span></div>
                                <div class="meta-item"><strong>Koli Adedi:</strong><span>${item.boxQty ?? '—'}</span></div>
                                <div class="meta-item"><strong>Ağırlık:</strong><span>${item.weight ?? '—'}</span></div>
                                <div class="meta-item"><strong>Kayıt ID:</strong><span class="mono">#${item.id}</span></div>
                                <div class="meta-item"><strong>Arama Etiketi (TR):</strong><span>${esc(item.tr || '—')}</span></div>
                            </div>
                        </div>

                        <div class="grid-card bg-glass margin-top-lg">
                            <div class="card-header">
                                <h2>Bu Ürünün Hareket Geçmişi</h2>
                                <p class="card-subtitle">Bu modele ait son stok giriş-çıkış hareketleri.</p>
                            </div>
                            <div class="table-container small-table">
                                <table>
                                    <thead>
                                        <tr><th>Tarih</th><th>İşlem Tipi</th><th>Miktar</th><th>Kullanıcı</th></tr>
                                    </thead>
                                    <tbody>
                                        ${item.history.length === 0
                                            ? '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Kayıt yok.</td></tr>'
                                            : item.history.map((h) => `
                                                <tr>
                                                    <td class="mono" style="font-size:0.75rem">${esc(h.date || fmtWhen(h.ts))}</td>
                                                    <td class="${h.type === 'in' ? 'move-in' : 'move-out'}">${h.type === 'in' ? 'Stok Girişi (+)' : 'Stok Çıkışı (−)'}</td>
                                                    <td class="mono" style="font-weight:700">${h.qty}</td>
                                                    <td>${esc(h.user || '—')}${h.note ? ` <span style="color:var(--text-muted)">(${esc(h.note)})</span>` : ''}</td>
                                                </tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>`;

            // Geri dönüş
            pane.querySelector('[data-back-to-stock]').addEventListener('click', () => { location.hash = '#/stok'; });

            // +/- sayaç
            const input = pane.querySelector('[data-qty-input]');
            pane.querySelector('[data-qty-plus]').addEventListener('click', () => {
                input.value = (parseInt(input.value, 10) || 0) + 1;
            });
            pane.querySelector('[data-qty-minus]').addEventListener('click', () => {
                input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
            });

            // Giriş / Çıkış kaydet (in-memory + toast, sonra yeniden çiz)
            const applyAdjust = async (sign) => {
                const val = parseInt(input.value, 10);
                if (!Number.isFinite(val) || val <= 0) {
                    showToast('Geçerli bir miktar girin.');
                    return;
                }
                const updated = await adjustItemStock(item.id, sign * val, { note: 'Manuel sayım düzeltmesi' });
                if (updated) {
                    showToast(`${updated.name}: yeni stok ${updated.qty} — kalıcı kayıt Faz 1'de (Supabase).`);
                    draw();
                }
            };
            pane.querySelector('[data-save-in]').addEventListener('click', () => applyAdjust(1));
            pane.querySelector('[data-save-out]').addEventListener('click', () => applyAdjust(-1));
        };

        draw();
    },
};
