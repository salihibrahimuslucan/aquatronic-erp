// Stok grubu görünümü (finished/production/cable/pano/motor) + ürün detayı.
// Grup alt-sekmelerle gelir; kart foto-öncelikli; +/- kalıcı stok hareketi yazar.
import {
    getGroup, getStockGroup, getItemById, getItems,
    stockIn, stockOut, saveProduct, stockStatus, stockStatusLabel,
    getBomDetail, setBomRow, removeBomRow, getWhereUsed,
    addProduct, setArchived, applyCount, getMissingPhotoItems,
    getSerialsForItem, updateSerialStatus,
} from '../data/store.js';
import { isCloud, uploadFile, publicFileUrl, removeFile } from '../data/supabase.js';
import {
    photoUrl, placeholderHtml, statusPillClass, esc, fmtWhen, iconForFamily,
    LIGHTING_MODELS, lightingModelOf, compressImage, SOURCE_META, sourceBadge,
} from './helpers.js';
import { showToast } from '../main.js';

const MAX_RENDER = 200;          // grid'e tek seferde en çok kart
const activeSub = {};            // groupId -> seçili alt-sekme (oturumda hatırla)

// Seri no durumu → etiket + pil sınıfı
const SERIAL_META = {
    produced: { label: 'Üretildi', cls: 'stage-prod' },
    tested:   { label: 'Test Edildi', cls: 'stage-await' },
    shipped:  { label: 'Sevk Edildi', cls: 'stage-won' },
};

function setHeader(title, subtitle) {
    document.getElementById('page-title-text').textContent = title;
    document.getElementById('page-subtitle-text').textContent = subtitle;
}

export const stockGroupView = {
    title: '', subtitle: '',
    async render(pane, { groupId }) {
        const g = getGroup(groupId);
        if (!g) { pane.innerHTML = '<p class="empty-row">Grup bulunamadı.</p>'; return; }
        let mode = 'grid';   // grid | count | archive

        const paint = async () => {
            if (mode === 'count') return paintCount();
            if (mode === 'archive') return paintArchive();
            return paintGrid();
        };

        // ── Katalog (grid) modu ─────────────────────────────────────────────
        async function paintGrid() {
            const { group, subs } = await getStockGroup(groupId);
            const { subs: archivedSubs } = await getStockGroup(groupId, true);
            const archivedCount = archivedSubs.reduce((n, s) => n + s.items.length, 0);
            const missingPhotos = groupId === 'finished' ? await getMissingPhotoItems() : [];
            setHeader(group.label, 'Foto-öncelikli ürün kataloğu ve anlık stok hareketleri.');

            if (!activeSub[groupId] || !subs.some((s) => s.key === activeSub[groupId])) {
                activeSub[groupId] = subs[0]?.key ?? null;
            }
            const multi = subs.length > 1;
            const curSub = () => subs.find((s) => s.key === activeSub[groupId]) ?? subs[0];

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
                    <div class="toolbar-actions">
                        <button class="btn btn-primary btn-sm" id="btn-add-product">＋ Ürün</button>
                        <button class="btn btn-outline btn-sm" id="btn-count-mode">Sayım</button>
                        <button class="btn btn-outline btn-sm" id="btn-archive-mode" ${archivedCount ? '' : 'disabled'}>Arşiv (${archivedCount})</button>
                        ${missingPhotos.length ? `<button class="btn btn-outline btn-sm" id="btn-foto-eksik">📷 Çekilecek (${missingPhotos.length})</button>` : ''}
                    </div>
                </div>
                <div class="start-form" id="add-form" hidden>
                    <input type="text" id="af-name" placeholder="Ürün adı *">
                    <input type="number" id="af-crt" value="0" min="0" title="Kritik seviye" style="max-width:110px">
                    <input type="text" id="af-note" placeholder="Not (opsiyonel)">
                    <input type="text" id="af-photo" placeholder="Foto dosya adı (public/foto altına konur, ör. 99.jpg)">
                    <button class="btn btn-primary" id="af-go">Ekle → ${esc(curSub()?.label ?? group.label)}</button>
                </div>
                <div id="grid"></div>`;

            const grid = pane.querySelector('#grid');
            const searchInput = pane.querySelector('#stock-search');

            const draw = () => {
                const q = searchInput.value.trim().toLowerCase();
                const list = q
                    ? subs.flatMap((s) => s.items).filter((i) =>
                        i.name.toLowerCase().includes(q) || (i.tr || '').toLowerCase().includes(q))
                    : (curSub()?.items ?? []);

                // Aydınlatma: adında model kodu geçen komponentler kendi bölümüne,
                // gerisi "Ortak" — arama yapılırken düz liste.
                if (!q && activeSub[groupId] === 'lighting') {
                    const buckets = new Map([['Ortak', []], ...LIGHTING_MODELS.map((m) => [m, []])]);
                    for (const it of list) buckets.get(lightingModelOf(it.name) ?? 'Ortak').push(it);
                    grid.innerHTML = [...buckets].filter(([, arr]) => arr.length).map(([label, arr]) => `
                        <div class="grid-section">
                            <h3 class="grid-section-title">${label === 'Ortak' ? 'Ortak Komponentler' : `Model ${label}`}
                                <span class="tab-count">${arr.length}</span></h3>
                            <div class="product-grid">${arr.map(renderCard).join('')}</div>
                        </div>`).join('') || '<div class="empty-state"><h3>Kayıt yok</h3></div>';
                    return;
                }

                const shown = list.slice(0, MAX_RENDER);
                grid.innerHTML = shown.length
                    ? `<div class="product-grid">${shown.map(renderCard).join('')}</div>` + (list.length > MAX_RENDER
                        ? `<p class="grid-more">${list.length - MAX_RENDER} kalem daha — aramayla daralt.</p>` : '')
                    : '<div class="empty-state"><h3>Kayıt yok</h3></div>';
            };

            pane.querySelectorAll('#sub-tabs .family-tab').forEach((btn) => {
                btn.addEventListener('click', () => {
                    activeSub[groupId] = btn.dataset.sub;
                    pane.querySelectorAll('#sub-tabs .family-tab').forEach((b) => b.classList.toggle('active', b === btn));
                    searchInput.value = '';
                    pane.querySelector('#af-go').textContent = `Ekle → ${curSub()?.label ?? group.label}`;
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

            // ＋ Ürün formu — aile/kategori aktif alt-sekmeden otomatik
            const addForm = pane.querySelector('#add-form');
            pane.querySelector('#btn-add-product').addEventListener('click', () => { addForm.hidden = !addForm.hidden; });
            pane.querySelector('#af-go').addEventListener('click', async () => {
                const m = curSub()?.match ?? {};
                const res = await addProduct({
                    name: pane.querySelector('#af-name').value,
                    family: m.family ?? group.id,
                    cat: m.cats?.[0] ?? '',
                    critical: pane.querySelector('#af-crt').value,
                    note: pane.querySelector('#af-note').value,
                    photo: pane.querySelector('#af-photo').value,
                });
                if (!res.ok) { showToast(res.error); return; }
                showToast(`Eklendi: ${res.item.name}`);
                await paint();
            });

            pane.querySelector('#btn-count-mode').addEventListener('click', () => { mode = 'count'; paint(); });
            const archBtn = pane.querySelector('#btn-archive-mode');
            if (!archBtn.disabled) archBtn.addEventListener('click', () => { mode = 'archive'; paint(); });
            pane.querySelector('#btn-foto-eksik')?.addEventListener('click', () => { location.hash = '#/foto-eksik'; });

            draw();
        }

        // ── Sayım modu ──────────────────────────────────────────────────────
        async function paintCount() {
            const { group, subs } = await getStockGroup(groupId);
            const rows = subs.flatMap((s) => s.items.map((i) => ({ sub: s.label, item: i })));
            setHeader(`Sayım — ${group.label}`, 'Fiziksel sayım sonuçlarını girin; farklar tek seferde deftere yazılır.');

            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div>
                            <h2>Sayım Modu <span class="count-chip">${rows.length} kalem</span></h2>
                            <p class="card-subtitle">Sayılan adedi girin; boş bırakılan satıra DOKUNULMAZ. "Sayımı İşle" farkları
                            "Sayım düzeltmesi" olarak ürün geçmişi + Hareket Defteri'ne yazar.</p>
                        </div>
                        <div class="toolbar-actions">
                            <button class="btn btn-outline" id="cnt-cancel">Vazgeç</button>
                            <button class="btn btn-primary" id="cnt-apply">Sayımı İşle</button>
                        </div>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Ürün</th><th>Alt Grup</th><th>Kayıtlı</th><th>Sayılan</th><th>Fark</th></tr></thead>
                            <tbody>
                                ${rows.map(({ sub, item }) => `
                                <tr>
                                    <td class="strong">${esc(item.name)}</td>
                                    <td class="mono" style="font-size:0.72rem;color:var(--text-muted)">${esc(sub)}</td>
                                    <td class="mono">${item.qty}</td>
                                    <td><input type="number" min="0" class="cnt-input" data-cnt-id="${item.id}" data-cnt-cur="${item.qty}" placeholder="—"></td>
                                    <td class="mono cnt-diff" data-diff-for="${item.id}">—</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;

            pane.querySelectorAll('.cnt-input').forEach((inp) => inp.addEventListener('input', () => {
                const cell = pane.querySelector(`[data-diff-for="${inp.dataset.cntId}"]`);
                const v = inp.value.trim();
                if (v === '') { cell.textContent = '—'; cell.style.color = ''; return; }
                const diff = (parseInt(v, 10) || 0) - Number(inp.dataset.cntCur);
                cell.textContent = diff > 0 ? `+${diff}` : String(diff);
                cell.style.color = diff === 0 ? 'var(--text-muted)' : (diff > 0 ? 'var(--color-green)' : 'var(--color-pink)');
            }));

            pane.querySelector('#cnt-cancel').addEventListener('click', () => { mode = 'grid'; paint(); });
            pane.querySelector('#cnt-apply').addEventListener('click', async () => {
                const entries = [...pane.querySelectorAll('.cnt-input')]
                    .filter((i) => i.value.trim() !== '')
                    .map((i) => ({ id: i.dataset.cntId, counted: i.value }));
                if (!entries.length) { showToast('Sayılan adet girilmedi.'); return; }
                const applied = await applyCount(entries);
                showToast(applied.length
                    ? `Sayım işlendi: ${applied.length} kalem düzeltildi (${entries.length - applied.length} fark yok).`
                    : 'Girilen sayımlar kayıtlı adetlerle aynı — düzeltme gerekmedi.');
                mode = 'grid';
                paint();
            });
        }

        // ── Arşiv modu ──────────────────────────────────────────────────────
        async function paintArchive() {
            const { group, subs } = await getStockGroup(groupId, true);
            const rows = subs.flatMap((s) => s.items.map((i) => ({ sub: s.label, item: i })));
            setHeader(`Arşiv — ${group.label}`, 'Arşivlenen kalemler katalog ve KPI dışıdır; geri alınabilir.');

            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div>
                            <h2>Arşiv <span class="count-chip">${rows.length}</span></h2>
                            <p class="card-subtitle">Silme yok — çıkarılan ürünler burada durur, "Geri Al" ile kataloğa döner.</p>
                        </div>
                        <button class="btn btn-outline" id="arch-back">← Kataloğa Dön</button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Ürün</th><th>Alt Grup</th><th>Son Stok</th><th>Not</th><th></th></tr></thead>
                            <tbody>
                                ${rows.length ? rows.map(({ sub, item }) => `
                                <tr>
                                    <td class="strong" style="cursor:pointer" data-arch-goto="${item.id}">${esc(item.name)}</td>
                                    <td class="mono" style="font-size:0.72rem;color:var(--text-muted)">${esc(sub)}</td>
                                    <td class="mono">${item.qty}</td>
                                    <td style="color:var(--text-secondary);font-size:0.75rem">${esc(item.note || '—')}</td>
                                    <td><button class="btn btn-outline btn-sm" data-arch-restore="${item.id}">Geri Al</button></td>
                                </tr>`).join('') : '<tr><td colspan="5" class="empty-row">Arşiv boş.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>`;

            pane.querySelector('#arch-back').addEventListener('click', () => { mode = 'grid'; paint(); });
            pane.querySelectorAll('[data-arch-restore]').forEach((b) => b.addEventListener('click', async () => {
                const p = await setArchived(b.dataset.archRestore, false);
                showToast(`Geri alındı: ${p?.name}`);
                paint();
            }));
            pane.querySelectorAll('[data-arch-goto]').forEach((el) => el.addEventListener('click', () => {
                location.hash = `#/stok/urun/${el.dataset.archGoto}`;
            }));
        }

        await paint();
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
                ${sourceBadge(p)}
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

        const draw = async () => {
            const st = stockStatus(p);
            const url = photoUrl(p);
            const [bomRows, whereUsed, allItems, serials] = await Promise.all([
                getBomDetail(p.id), getWhereUsed(p.id), getItems(), getSerialsForItem(p.id),
            ]);
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
                            ${sourceBadge(p)}
                            ${p.archived ? '<span class="stage-pill stage-lost" style="margin-left:8px">ARŞİVDE</span>' : ''}
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
                                <div class="source-edit">
                                    <label class="source-edit-title">🔗 Kaynak / Tedarik <span class="hint">— bu parça nereden gelir?</span></label>
                                    <div class="form-row-2">
                                        <div class="form-group"><label>Kaynak Tipi</label>
                                            <select id="e-source">
                                                <option value="" ${!p.sourceType ? 'selected' : ''}>— belirsiz —</option>
                                                ${Object.entries(SOURCE_META).map(([k, m]) =>
                                                    `<option value="${k}" ${p.sourceType === k ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}
                                            </select></div>
                                        <div class="form-group"><label>Tedarikçi</label>
                                            <input type="text" id="e-supplier" value="${esc(p.supplier || '')}" placeholder="ör. Ömer Kablo, Mean Well"></div>
                                    </div>
                                    <div class="form-group"><label>Tedarik Notu <span class="hint">(marka, min. sipariş, teslim süresi)</span></label>
                                        <input type="text" id="e-source-note" value="${esc(p.sourceNote || '')}" placeholder="opsiyonel"></div>
                                </div>
                                <div class="form-group"><label>Fotoğraf</label>
                                    <div class="photo-edit-row">
                                        ${isCloud() ? `
                                        <button class="btn btn-outline btn-sm" id="btn-photo-upload">📤 Foto Yükle</button>
                                        ${p.photo ? '<button class="btn btn-outline btn-sm" id="btn-photo-remove">✕ Kaldır</button>' : ''}
                                        <input type="file" id="photo-file" accept="image/*" hidden>` : ''}
                                        <input type="text" id="e-photo" value="${esc((p.photo || '').replace(/^foto\//, ''))}" placeholder="ör. 99.jpg (public/foto) — boş = foto yok">
                                    </div>
                                </div>
                                <div class="meta-mini">Kod/ID: #${p.id} · Arama etiketi: ${esc(p.tr || '—')}</div>
                                <div class="toolbar-actions">
                                    <button class="btn btn-primary" id="btn-save">Bilgileri Kaydet</button>
                                    <button class="btn btn-outline" id="btn-archive">${p.archived ? 'Arşivden Geri Al' : 'Arşivle'}</button>
                                </div>
                            </div>
                        </div>
                        <div class="grid-card bg-glass margin-top-lg">
                            <div class="card-header"><h2>Reçete (BOM)</h2>
                            <p class="card-subtitle">1 adet ${esc(p.name)} için tüketilen komponentler — üretim emri tamamlanınca stoktan otomatik düşer.</p></div>
                            <div class="table-container small-table">
                                <table><thead><tr><th>Komponent</th><th>Adet / Ürün</th><th>Komponent Stoku</th><th></th></tr></thead>
                                <tbody>${bomRows.length ? bomRows.map((r) => r.item ? `
                                    <tr>
                                        <td class="strong" style="cursor:pointer" data-bom-goto="${r.item.id}">${esc(r.item.name)}</td>
                                        <td class="mono">×${r.qty}</td>
                                        <td class="mono ${stockStatus(r.item) === 'critical' ? 'text-pink' : ''}">${r.item.qty}</td>
                                        <td><button class="row-del" data-bom-del="${r.item.id}" title="Reçeteden çıkar">✕</button></td>
                                    </tr>` : `
                                    <tr>
                                        <td class="strong" style="color:var(--text-muted)">Silinmiş kalem (#${esc(r.itemId)})</td>
                                        <td class="mono">×${r.qty}</td><td>—</td>
                                        <td><button class="row-del" data-bom-del="${esc(r.itemId)}" title="Reçeteden çıkar">✕</button></td>
                                    </tr>`).join('')
                                    : '<tr><td colspan="4" class="empty-row">Reçete boş — aşağıdan komponent ekleyin.</td></tr>'}
                                </tbody></table>
                            </div>
                            <div class="start-form" style="margin-top:12px">
                                <input type="text" id="bom-item" list="bom-item-list" placeholder="Komponent ara (ad yazın)...">
                                <datalist id="bom-item-list">
                                    ${allItems.filter((i) => String(i.id) !== String(p.id) && !i.archived)
                                        .map((i) => `<option value="${esc(i.name)} (#${i.id})"></option>`).join('')}
                                </datalist>
                                <input type="number" id="bom-qty" value="1" min="1" title="1 adet ürün için adet">
                                <button class="btn btn-primary" id="bom-add">+ Reçeteye Ekle</button>
                            </div>
                        </div>
                        ${whereUsed.length ? `
                        <div class="grid-card bg-glass margin-top-lg">
                            <div class="card-header"><h2>Nerede Kullanılıyor</h2>
                            <p class="card-subtitle">Bu kalemi reçetesinde tüketen ürünler.</p></div>
                            <div class="table-container small-table">
                                <table><thead><tr><th>Ürün</th><th>Adet / Ürün</th></tr></thead>
                                <tbody>${whereUsed.map((w) => `
                                    <tr>
                                        <td class="strong" style="cursor:pointer" data-bom-goto="${w.product.id}">${esc(w.product.name)}</td>
                                        <td class="mono">×${w.qty}</td>
                                    </tr>`).join('')}
                                </tbody></table>
                            </div>
                        </div>` : ''}
                        ${serials.length ? `
                        <div class="grid-card bg-glass margin-top-lg">
                            <div class="card-header"><h2>Seri Numaraları <span class="count-chip">${serials.length}</span></h2>
                            <p class="card-subtitle">Bu üründen üretilen cihaz birimleri — her üretim tamamlanınca otomatik atanır.</p></div>
                            <div class="serial-kpi-row">
                                ${['produced', 'tested', 'shipped'].map((s) => {
                                    const n = serials.filter((x) => x.status === s).length;
                                    return `<span class="serial-kpi ${SERIAL_META[s].cls}">${SERIAL_META[s].label}: <b>${n}</b></span>`;
                                }).join('')}
                            </div>
                            <div class="table-container small-table">
                                <table><thead><tr><th>Seri No</th><th>Emir</th><th>Tarih</th><th>Durum</th><th></th></tr></thead>
                                <tbody>${serials.slice(0, 60).map((s) => `
                                    <tr>
                                        <td class="mono strong">${esc(s.serial)}</td>
                                        <td class="mono">${s.orderId ? 'PO-' + esc(s.orderId) : '—'}</td>
                                        <td class="mono">${esc(fmtWhen(s.createdAt))}</td>
                                        <td><span class="stage-pill ${SERIAL_META[s.status]?.cls ?? ''}">${SERIAL_META[s.status]?.label ?? s.status}</span></td>
                                        <td>${s.status !== 'shipped' ? `<button class="btn btn-outline btn-sm" data-serial-ship="${esc(s.id)}">Sevk Et</button>` : ''}</td>
                                    </tr>`).join('')}
                                </tbody></table>
                            </div>
                            ${serials.length > 60 ? `<p class="grid-more">${serials.length - 60} seri daha (ilk 60 gösteriliyor).</p>` : ''}
                        </div>` : ''}
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
                    sourceType: pane.querySelector('#e-source').value,
                    supplier: pane.querySelector('#e-supplier').value.trim(),
                    sourceNote: pane.querySelector('#e-source-note').value.trim(),
                    photo: pane.querySelector('#e-photo').value,
                });
                showToast('Kaydedildi.'); draw();
            });
            pane.querySelectorAll('[data-serial-ship]').forEach((b) => b.addEventListener('click', async () => {
                await updateSerialStatus(b.dataset.serialShip, 'shipped');
                showToast('Sevk edildi olarak işaretlendi.'); draw();
            }));
            pane.querySelector('#btn-archive').addEventListener('click', async () => {
                await setArchived(p.id, !p.archived);
                showToast(p.archived ? `Arşivlendi: ${p.name}` : `Geri alındı: ${p.name}`);
                draw();
            });

            // Site içi foto yönetimi (bulut modu): küçült → Storage'a yükle →
            // public URL'i ürüne yaz; eski Storage fotosu kovadan silinir.
            const photoInp = pane.querySelector('#photo-file');
            pane.querySelector('#btn-photo-upload')?.addEventListener('click', () => photoInp.click());
            photoInp?.addEventListener('change', async () => {
                const file = photoInp.files?.[0];
                if (!file) return;
                try {
                    showToast('Fotoğraf yükleniyor...');
                    const blob = await compressImage(file);
                    const path = `items/${p.id}-${Date.now()}.jpg`;
                    await uploadFile(path, blob, 'image/jpeg');
                    const old = p.photo;
                    await saveProduct(p.id, { photo: publicFileUrl(path) });
                    if (old && /^https?:/i.test(old)) removeFile(old);
                    showToast('Fotoğraf güncellendi.');
                    draw();
                } catch (e) { showToast(`Yükleme hatası: ${e.message}`); }
            });
            pane.querySelector('#btn-photo-remove')?.addEventListener('click', async () => {
                if (!confirm(`${p.name} fotoğrafı kaldırılsın mı?`)) return;
                const old = p.photo;
                await saveProduct(p.id, { photo: '' });
                if (old && /^https?:/i.test(old)) removeFile(old);
                showToast('Fotoğraf kaldırıldı.');
                draw();
            });
            pane.querySelectorAll('[data-goto]').forEach((el) =>
                el.addEventListener('click', () => { location.hash = `#/${el.dataset.goto}`; }));

            // Reçete: ekle / çıkar / komponente git
            pane.querySelector('#bom-add').addEventListener('click', async () => {
                const raw = pane.querySelector('#bom-item').value.trim();
                const qty = pane.querySelector('#bom-qty').value;
                const m = /#(\d+)\)\s*$/.exec(raw);
                let comp = m ? await getItemById(m[1]) : null;
                if (!comp && raw) {
                    const all = await getItems();
                    comp = all.find((i) => i.name.toLowerCase() === raw.toLowerCase()) ?? null;
                }
                if (!comp) { showToast('Komponent bulunamadı — listeden seçin.'); return; }
                const ok = await setBomRow(p.id, comp.id, qty);
                showToast(ok ? `Reçeteye eklendi: ${comp.name} ×${qty}` : 'Eklenemedi (adet ≥ 1 olmalı).');
                if (ok) draw();
            });
            pane.querySelectorAll('[data-bom-del]').forEach((btn) => btn.addEventListener('click', async () => {
                await removeBomRow(p.id, btn.dataset.bomDel);
                showToast('Reçeteden çıkarıldı.');
                draw();
            }));
            pane.querySelectorAll('[data-bom-goto]').forEach((el) => el.addEventListener('click', () => {
                location.hash = `#/stok/urun/${el.dataset.bomGoto}`;
            }));
        };
        await draw();
    },
};

// Ürünün ait olduğu üst grubu bul (geri dönüş linki için)
function groupOf(p) {
    const map = {
        finished: 'finished', lighting: 'production', vario: 'production', switch: 'production',
        nozzle: 'production', powerbox: 'production', cable: 'cable', pano: 'pano', motor: 'motor',
        pcbcard: 'elektronik', pcbcomp: 'elektronik',
    };
    return map[p.family] ?? 'finished';
}
