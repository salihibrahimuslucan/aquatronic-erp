// Özel operasyon görünümleri: Aktif Üretim · Planlı Üretim · Havuz Testi.
// Netlify aquatronic-v7.html karşılıkları (active / planned / pool).
import {
    getActiveRuns, getProductionArchive, startProduction, completeRun,
    getPlans, addPlan, deletePlan,
    getPoolItems, getItems,
} from '../data/store.js';
import { esc, fmtWhen } from './helpers.js';
import { showToast } from '../main.js';

function setHeader(t, s) {
    document.getElementById('page-title-text').textContent = t;
    document.getElementById('page-subtitle-text').textContent = s;
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
                    <div class="card-header flex-row">
                        <div><h2>🔥 Şu An Üretimde <span class="count-chip">${runs.length}</span></h2>
                        <p class="card-subtitle">Üretime alınmış iş emirleri; tamamlanınca stoğa geçer.</p></div>
                        <button class="btn btn-primary" id="btn-start">+ Üretim Başlat</button>
                    </div>
                    <div class="start-form" id="start-form" hidden>
                        <select id="sf-product">${items.map((i) => `<option>${esc(i.name)}</option>`).join('')}</select>
                        <input type="number" id="sf-qty" value="10" min="1" placeholder="Adet">
                        <input type="text" id="sf-note" placeholder="Not (opsiyonel)">
                        <button class="btn btn-primary" id="sf-go">Başlat</button>
                    </div>
                    <div class="table-container">
                        <table><thead><tr><th>Ürün</th><th>Adet</th><th>Başlangıç</th><th>Not</th><th></th></tr></thead>
                        <tbody>${runs.length ? runs.map((r) => `
                            <tr>
                                <td class="strong">${esc(r.name)}</td>
                                <td class="mono">${r.qty}</td>
                                <td class="mono">${esc(fmtWhen(r.startedAt))}</td>
                                <td>${esc(r.note || '—')}</td>
                                <td><button class="btn btn-outline btn-sm" data-done="${r.id}">→ Bitir & Stoğa Al</button></td>
                            </tr>`).join('') : '<tr><td colspan="5" class="empty-row">Şu an aktif üretim yok.</td></tr>'}
                        </tbody></table>
                    </div>
                </div>
                <div class="grid-card bg-glass margin-top-lg">
                    <div class="card-header"><h2>📅 Üretim Arşivi <span class="count-chip">${archive.length}</span></h2>
                    <p class="card-subtitle">Tamamlanmış üretim geçmişi.</p></div>
                    <div class="table-container">
                        <table><thead><tr><th>Ürün</th><th>Adet</th><th>Tamamlandı</th><th>Not</th></tr></thead>
                        <tbody>${archive.length ? archive.slice(0, 50).map((a) => `
                            <tr><td class="strong">${esc(a.name)}</td><td class="mono">${a.qty}</td>
                            <td class="mono">${esc(fmtWhen(a.completedAt))}</td><td>${esc(a.note || '')}${a.user ? ' · ' + esc(a.user) : ''}</td></tr>`).join('')
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
        setHeader('Planlı Üretim', 'Planlanan üretim işleri ve notları.');
        const draw = async () => {
            const plans = await getPlans();
            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div><h2>📋 Planlı Üretim <span class="count-chip">${plans.length}</span></h2>
                        <p class="card-subtitle">Üretim sırasına alınacak işler.</p></div>
                        <button class="btn btn-primary" id="btn-plan">+ Yeni Plan</button>
                    </div>
                    <div class="start-form" id="plan-form" hidden>
                        <input type="text" id="pf-name" placeholder="Ürün / iş adı">
                        <input type="text" id="pf-cat" placeholder="Kategori (opsiyonel)">
                        <input type="text" id="pf-note" placeholder="Not">
                        <button class="btn btn-primary" id="pf-go">Ekle</button>
                    </div>
                    <div class="planned-grid">${plans.length ? plans.map((p) => `
                        <div class="planned-card bg-glass">
                            <div class="planned-body">
                                <div class="planned-name">${esc(p.name)}</div>
                                <div class="planned-cat">${esc(p.cat || '—')}</div>
                                <p class="planned-note">${esc(p.note || '')}</p>
                                <div class="planned-meta mono">${esc(fmtWhen(p.createdAt))} · ${esc(p.user || '')}</div>
                            </div>
                            <button class="planned-del" data-del="${p.id}" title="Sil">✕</button>
                        </div>`).join('') : '<div class="empty-state"><h3>Plan yok — "Yeni Plan" ile ekleyin.</h3></div>'}
                    </div>
                </div>`;
            const form = pane.querySelector('#plan-form');
            pane.querySelector('#btn-plan').addEventListener('click', () => { form.hidden = !form.hidden; });
            pane.querySelector('#pf-go').addEventListener('click', async () => {
                const name = pane.querySelector('#pf-name').value.trim();
                if (!name) return;
                await addPlan(name, pane.querySelector('#pf-cat').value, pane.querySelector('#pf-note').value);
                showToast('Plan eklendi.'); draw();
            });
            pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
                await deletePlan(Number(b.dataset.del)); draw();
            }));
        };
        await draw();
    },
};

// ─── Havuz Testi ───────────────────────────────────────────────────────────
export const poolView = {
    title: '', subtitle: '',
    async render(pane) {
        setHeader('Havuz Testi', 'Su altı kalibrasyon ve sızdırmazlık test kayıtları.');
        const pool = await getPoolItems();
        pane.innerHTML = `
            <div class="grid-card bg-glass">
                <div class="card-header"><h2>🏊 Havuz Testi İstasyonu <span class="count-chip">${pool.length}</span></h2>
                <p class="card-subtitle">Test tankındaki / test edilmiş cihazlar.</p></div>
                <div class="table-container">
                    <table><thead><tr><th>Cihaz</th><th>Seri No</th><th>Durum</th><th>Akım (boş/yük)</th><th>Yükseklik</th><th>Başlangıç</th><th>Bitiş</th></tr></thead>
                    <tbody>${pool.length ? pool.map((p) => `
                        <tr>
                            <td class="strong">${esc(p.device || p.desc || '—')}</td>
                            <td class="mono">${esc(p.sn || '—')}</td>
                            <td><span class="stage-pill ${/çalış|calis|ok|geç|gec/i.test(p.status || '') ? 'stage-won' : 'stage-await'}">${esc(p.status || '—')}</span></td>
                            <td class="mono">${esc(p.currentIdle || '—')} / ${esc(p.currentRun || '—')}</td>
                            <td class="mono">${esc(p.height || '—')}</td>
                            <td class="mono">${esc(p.startDate || '—')}</td>
                            <td class="mono">${esc(p.endDate || '—')}</td>
                        </tr>`).join('') : '<tr><td colspan="7" class="empty-row">Havuz testi kaydı yok.</td></tr>'}
                    </tbody></table>
                </div>
            </div>`;
    },
};
