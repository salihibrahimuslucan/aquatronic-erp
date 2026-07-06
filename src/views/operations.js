// Özel operasyon görünümleri: Aktif Üretim · Planlı Üretim · Havuz Testi.
// Netlify aquatronic-v7.html karşılıkları (active / planned / pool).
import {
    getActiveRuns, getProductionArchive, startProduction, completeRun,
    getPlans, addPlan, setPlanPdf, deletePlan, startPlan,
    getPoolItems, addPoolTest, updatePoolTest, deletePoolTest, getItems,
} from '../data/store.js';
import { isCloud, uploadFile, publicFileUrl } from '../data/supabase.js';
import { esc, fmtWhen } from './helpers.js';
import { showToast, salesAllowed } from '../main.js';

// CRM fırsatına geri-bağ rozeti (yalnız CRM görebilen roller — üretim görmez).
function dealBadge(dealId) {
    if (!dealId || !salesAllowed()) return '';
    return `<a class="crm-badge" href="#/crm/deal/${esc(dealId)}" title="Bağlı CRM fırsatı">🏭 ${esc(dealId)}</a>`;
}

function setHeader(t, s) {
    document.getElementById('page-title-text').textContent = t;
    document.getElementById('page-subtitle-text').textContent = s;
}

// Storage'daki plan PDF'ine küçük link (yoksa boş string)
function pdfIcon(path) {
    if (!path) return '';
    return `<a class="pdf-link" href="${esc(publicFileUrl(path))}" target="_blank" rel="noopener" title="Plan PDF">📄</a>`;
}

// Storage anahtarı: güvenli dosya adı
function safeName(name) {
    return String(name ?? 'dosya').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

// ─── Aktif Üretim ──────────────────────────────────────────────────────────
export const activeView = {
    title: '', subtitle: '',
    async render(pane) {
        setHeader('Aktif Üretim', 'Şu an üretimdeki iş emirleri ve tamamlanan üretim arşivi.');
        const draw = async () => {
            const [runs, archive, items] = await Promise.all([getActiveRuns(), getProductionArchive(), getItems()]);
            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header">
                        <h2>🔥 Şu An Üretimde <span class="count-chip">${runs.length}</span></h2>
                        <p class="card-subtitle">Üretime alınmış iş emirleri; tamamlanınca stoğa geçer.</p>
                    </div>
                    <div class="table-container">
                        <table><thead><tr><th>Ürün</th><th>Adet</th><th>Başlangıç</th><th>Not</th><th></th></tr></thead>
                        <tbody>${runs.length ? runs.map((r) => `
                            <tr>
                                <td class="strong">${esc(r.name)} ${dealBadge(r.dealId)}</td>
                                <td class="mono">${r.qty}</td>
                                <td class="mono">${esc(fmtWhen(r.startedAt))}</td>
                                <td>${pdfIcon(r.pdf)}${esc(r.note || '—')}</td>
                                <td><button class="btn btn-outline btn-sm" data-done="${r.id}">→ Bitir & Stoğa Al</button></td>
                            </tr>`).join('') : '<tr><td colspan="5" class="empty-row">Şu an aktif üretim yok.</td></tr>'}
                        </tbody></table>
                    </div>
                    <div class="start-form" id="start-form" hidden>
                        <select id="sf-product">${items.map((i) => `<option>${esc(i.name)}</option>`).join('')}</select>
                        <input type="number" id="sf-qty" value="10" min="1" placeholder="Adet">
                        <input type="text" id="sf-note" placeholder="Not (opsiyonel)">
                        <button class="btn btn-primary" id="sf-go">Başlat</button>
                    </div>
                    <div class="toolbar-actions">
                        <button class="btn btn-outline btn-sm" id="btn-start">＋ Manuel üretim başlat</button>
                    </div>
                </div>
                <div class="grid-card bg-glass margin-top-lg">
                    <div class="card-header"><h2>📅 Üretim Arşivi <span class="count-chip">${archive.length}</span></h2>
                    <p class="card-subtitle">Tamamlanmış üretim geçmişi.</p></div>
                    <div class="table-container">
                        <table><thead><tr><th>Ürün</th><th>Adet</th><th>Tamamlandı</th><th>Not</th></tr></thead>
                        <tbody>${archive.length ? archive.slice(0, 50).map((a) => `
                            <tr><td class="strong">${esc(a.name)}</td><td class="mono">${a.qty}</td>
                            <td class="mono">${esc(fmtWhen(a.completedAt))}</td><td>${pdfIcon(a.pdf)}${esc(a.note || '')}${a.user ? ' · ' + esc(a.user) : ''}</td></tr>`).join('')
                            : '<tr><td colspan="4" class="empty-row">Henüz tamamlanmış üretim yok.</td></tr>'}
                        </tbody></table>
                    </div>
                </div>`;

            const form = pane.querySelector('#start-form');
            pane.querySelector('#btn-start').addEventListener('click', () => { form.hidden = !form.hidden; });
            pane.querySelector('#sf-go').addEventListener('click', async () => {
                const name = pane.querySelector('#sf-product').value;
                const qty = pane.querySelector('#sf-qty').value;
                await startProduction(name, qty, pane.querySelector('#sf-note').value);
                showToast(`Üretime alındı: ${name} ×${qty}`); draw();
            });
            pane.querySelectorAll('[data-done]').forEach((btn) => btn.addEventListener('click', async () => {
                const r = await completeRun(Number(btn.dataset.done));
                showToast(`Tamamlandı: ${r?.name} → stoğa eklendi`); draw();
            }));
        };
        await draw();
    },
};

// ─── Planlı Üretim ─────────────────────────────────────────────────────────
export const plannedView = {
    title: '', subtitle: '',
    async render(pane) {
        setHeader('Planlı Üretim', 'Planlanan üretim işleri, notları ve plan PDF\'leri.');
        const cloud = isCloud();

        // Seçilen PDF'i kovaya yükle, yolunu döndür (yalnız bulut modu)
        async function uploadPdf(file) {
            const path = `plans/${Date.now()}-${safeName(file.name)}`;
            await uploadFile(path, file, 'application/pdf');
            return path;
        }

        const draw = async () => {
            const plans = await getPlans();
            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div><h2>📋 Planlı Üretim <span class="count-chip">${plans.length}</span></h2>
                        <p class="card-subtitle">Üretim sırasına alınacak işler${cloud ? ' — karta PDF (çizim, iş emri, sipariş formu) eklenebilir' : ''}.</p></div>
                        <button class="btn btn-primary" id="btn-plan">+ Yeni Plan</button>
                    </div>
                    <div class="start-form" id="plan-form" hidden>
                        <input type="text" id="pf-name" placeholder="Ürün / iş adı">
                        <input type="text" id="pf-cat" placeholder="Kategori (opsiyonel)">
                        <input type="text" id="pf-note" placeholder="Not">
                        ${cloud ? '<input type="file" id="pf-pdf" accept="application/pdf" title="Plan PDF (opsiyonel)">' : ''}
                        <button class="btn btn-primary" id="pf-go">Ekle</button>
                    </div>
                    <div class="planned-grid">${plans.length ? plans.map((p) => `
                        <div class="planned-card bg-glass">
                            <div class="planned-body">
                                <div class="planned-name">${esc(p.name)} ${p.qty > 1 ? `<span class="mono planned-qty">×${p.qty}</span>` : ''} ${dealBadge(p.dealId)}</div>
                                <div class="planned-cat">${esc(p.cat || '—')}</div>
                                <p class="planned-note">${esc(p.note || '')}</p>
                                ${p.pdf
                                    ? `<a class="planned-pdf" href="${esc(publicFileUrl(p.pdf))}" target="_blank" rel="noopener">📄 Plan PDF'ini aç</a>`
                                    : (cloud ? `<button class="planned-pdf planned-pdf-add" data-attach="${p.id}">📎 PDF ekle</button>` : '')}
                                <div class="planned-meta mono">${esc(fmtWhen(p.createdAt))} · ${esc(p.user || '')}</div>
                            </div>
                            <div class="planned-actions">
                                <button class="btn btn-primary btn-sm" data-start="${p.id}" title="Aktif üretime al">▶ Üretime Al</button>
                                <button class="planned-del" data-del="${p.id}" title="Sil">✕</button>
                            </div>
                        </div>`).join('') : '<div class="empty-state"><h3>Plan yok — "Yeni Plan" ile ekleyin.</h3></div>'}
                    </div>
                    ${cloud ? '<input type="file" id="attach-pdf" accept="application/pdf" hidden>' : ''}
                </div>`;
            const form = pane.querySelector('#plan-form');
            pane.querySelector('#btn-plan').addEventListener('click', () => { form.hidden = !form.hidden; });
            pane.querySelector('#pf-go').addEventListener('click', async () => {
                const name = pane.querySelector('#pf-name').value.trim();
                if (!name) return;
                let pdfPath = '';
                const fileInp = pane.querySelector('#pf-pdf');
                try {
                    if (fileInp?.files?.[0]) pdfPath = await uploadPdf(fileInp.files[0]);
                } catch (e) { showToast(`PDF yüklenemedi: ${e.message}`); return; }
                await addPlan(name, pane.querySelector('#pf-cat').value, pane.querySelector('#pf-note').value, pdfPath);
                showToast(pdfPath ? 'Plan + PDF eklendi.' : 'Plan eklendi.'); draw();
            });
            pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
                await deletePlan(Number(b.dataset.del)); draw();
            }));
            pane.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', async () => {
                const run = await startPlan(Number(b.dataset.start));
                showToast(run ? `Üretime alındı: ${run.name} ×${run.qty}` : 'Emir bulunamadı');
                draw();
            }));

            // Var olan karta sonradan PDF bağlama (gizli ortak file input)
            const attachInp = pane.querySelector('#attach-pdf');
            if (attachInp) {
                let attachId = null;
                pane.querySelectorAll('[data-attach]').forEach((b) => b.addEventListener('click', () => {
                    attachId = Number(b.dataset.attach);
                    attachInp.value = '';
                    attachInp.click();
                }));
                attachInp.addEventListener('change', async () => {
                    const file = attachInp.files?.[0];
                    if (!file || attachId == null) return;
                    try {
                        const path = await uploadPdf(file);
                        await setPlanPdf(attachId, path);
                        showToast('PDF karta bağlandı.'); draw();
                    } catch (e) { showToast(`PDF yüklenemedi: ${e.message}`); }
                });
            }
        };
        await draw();
    },
};

// ─── Havuz Testi ───────────────────────────────────────────────────────────
const POOL_FORM_FIELDS = [
    { key: 'device', ph: 'Cihaz *', w: 160 },
    { key: 'sn', ph: 'Seri No', w: 130 },
    { key: 'status', ph: 'Durum (Çalışıyor / Arızalı...)', w: 150 },
    { key: 'address', ph: 'DMX Adresi', w: 100 },
    { key: 'currentIdle', ph: 'Akım boşta', w: 100 },
    { key: 'currentRun', ph: 'Akım yükte', w: 100 },
    { key: 'height', ph: 'Yükseklik', w: 90 },
    { key: 'startDate', ph: 'Başlangıç (2026-07-06)', w: 130 },
    { key: 'endDate', ph: 'Bitiş', w: 110 },
    { key: 'notes', ph: 'Not', w: 170 },
];

export const poolView = {
    title: '', subtitle: '',
    async render(pane) {
        setHeader('Havuz Testi', 'Su altı kalibrasyon ve sızdırmazlık test kayıtları.');
        let editId = null;   // null = yeni kayıt formu; dolu = o kaydı düzenle

        const draw = async () => {
            const pool = await getPoolItems();
            const editing = editId != null ? pool.find((p) => String(p.id) === String(editId)) : null;
            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div><h2>🏊 Havuz Testi İstasyonu <span class="count-chip">${pool.length}</span></h2>
                        <p class="card-subtitle">Test tankındaki / test edilmiş cihazlar.</p></div>
                        <button class="btn btn-primary" id="btn-pool-add">+ Kayıt</button>
                    </div>
                    <div class="start-form" id="pool-form" ${editing ? '' : 'hidden'}>
                        ${POOL_FORM_FIELDS.map((f) => `
                            <input type="text" id="plf-${f.key}" placeholder="${esc(f.ph)}"
                                   style="min-width:${f.w}px" value="${esc(editing?.[f.key] ?? '')}">`).join('')}
                        <button class="btn btn-primary" id="plf-go">${editing ? 'Kaydet' : 'Ekle'}</button>
                        ${editing ? '<button class="btn btn-outline" id="plf-cancel">Vazgeç</button>' : ''}
                    </div>
                    <div class="table-container">
                        <table><thead><tr><th>Cihaz</th><th>Seri No</th><th>Durum</th><th>Akım (boş/yük)</th><th>Yükseklik</th><th>Başlangıç</th><th>Bitiş</th><th></th></tr></thead>
                        <tbody>${pool.length ? pool.map((p) => `
                            <tr>
                                <td class="strong">${esc(p.device || p.desc || '—')}</td>
                                <td class="mono">${esc(p.sn || '—')}</td>
                                <td><span class="stage-pill ${/çalış|calis|ok|geç|gec/i.test(p.status || '') ? 'stage-won' : 'stage-await'}">${esc(p.status || '—')}</span></td>
                                <td class="mono">${esc(p.currentIdle || '—')} / ${esc(p.currentRun || '—')}</td>
                                <td class="mono">${esc(p.height || '—')}</td>
                                <td class="mono">${esc(p.startDate || '—')}</td>
                                <td class="mono">${esc(p.endDate || '—')}</td>
                                <td class="row-actions">
                                    <button class="row-edit" data-edit="${p.id}" title="Düzenle">✎</button>
                                    <button class="row-del" data-del="${p.id}" title="Sil">✕</button>
                                </td>
                            </tr>`).join('') : '<tr><td colspan="8" class="empty-row">Havuz testi kaydı yok.</td></tr>'}
                        </tbody></table>
                    </div>
                </div>`;

            const form = pane.querySelector('#pool-form');
            const readForm = () => Object.fromEntries(
                POOL_FORM_FIELDS.map((f) => [f.key, pane.querySelector(`#plf-${f.key}`).value.trim()]));

            pane.querySelector('#btn-pool-add').addEventListener('click', () => {
                if (editId != null) { editId = null; draw(); return; }
                form.hidden = !form.hidden;
            });
            pane.querySelector('#plf-go').addEventListener('click', async () => {
                const fields = readForm();
                if (editId != null) {
                    await updatePoolTest(editId, fields);
                    showToast(`Güncellendi: ${fields.device}`);
                    editId = null;
                } else {
                    const res = await addPoolTest(fields);
                    if (!res.ok) { showToast(res.error); return; }
                    showToast(`Eklendi: ${res.rec.device}`);
                }
                draw();
            });
            pane.querySelector('#plf-cancel')?.addEventListener('click', () => { editId = null; draw(); });

            pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
                editId = b.dataset.edit; draw();
            }));
            pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
                const rec = pool.find((p) => String(p.id) === String(b.dataset.del));
                if (!confirm(`"${rec?.device ?? '?'}" havuz testi kaydı silinsin mi?`)) return;
                await deletePoolTest(b.dataset.del);
                showToast('Kayıt silindi.');
                draw();
            }));
        };
        await draw();
    },
};
