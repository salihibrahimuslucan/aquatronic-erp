// Fason Üretim — outsource_jobs (Ömer Kablo işleri), site içi ekle/düzenle/sil.
// Gerçek alanlar: id / item / qty / status ('' | 'gonderildi' | 'uretimde' | '✅') /
// reqDate / givenMat / receivedQty / receivedDate / price / note.
import { getOutsourceJobs, addOutsourceJob, updateOutsourceJob, deleteOutsourceJob } from '../data/store.js';
import { esc } from './helpers.js';
import { showToast } from '../main.js';

const STATUS_OPTIONS = [
    { value: '', label: 'Açık' },
    { value: 'gonderildi', label: 'Gönderildi' },
    { value: 'uretimde', label: 'Üretimde' },
    { value: '✅', label: 'Teslim Alındı' },
];
// Eski sample şemasındaki string'leri de aynı kovaya düşür
function statusValueOf(raw) {
    const s = String(raw ?? '').trim();
    if (s === '✅' || s === 'teslim_alindi' || s === 'delivered') return '✅';
    if (s === 'gonderildi' || s === 'sent') return 'gonderildi';
    if (s === 'uretimde') return 'uretimde';
    return '';
}

const FORM_FIELDS = [
    { key: 'item', ph: 'Ürün / kalem *', w: 180 },
    { key: 'qty', ph: 'Adet', w: 80 },
    { key: 'reqDate', ph: 'Talep tarihi', w: 110 },
    { key: 'givenMat', ph: 'Verilen malzeme', w: 170 },
    { key: 'receivedQty', ph: 'Alınan miktar', w: 110 },
    { key: 'receivedDate', ph: 'Alınma tarihi', w: 110 },
    { key: 'price', ph: 'Fiyat', w: 90 },
    { key: 'note', ph: 'Not', w: 160 },
];

export const outsourceView = {
    title: 'Dış Üretim',
    subtitle: 'Dış kablolama ve montaj ortaklığındaki (Ömer Kablo) fason iş emirleri.',

    async render(pane) {
        let editId = null;

        const draw = async () => {
            const jobs = await getOutsourceJobs();
            const editing = editId != null ? jobs.find((j) => String(j.id) === String(editId)) : null;

            pane.innerHTML = `
                <div class="grid-card bg-glass">
                    <div class="card-header flex-row">
                        <div>
                            <h2>🏗️ Fason Üretim Takip Paneli (Ömer Kablo)</h2>
                            <p class="card-subtitle">Dış tesiste süren kablo gruplama, konnektör montaj ve reçineleme işleri — ${jobs.length} kayıt.</p>
                        </div>
                        <button class="btn btn-primary" id="btn-job-add">+ İş</button>
                    </div>
                    <div class="start-form" id="job-form" ${editing ? '' : 'hidden'}>
                        ${FORM_FIELDS.map((f) => `
                            <input type="text" id="jf-${f.key}" placeholder="${esc(f.ph)}"
                                   style="min-width:${f.w}px" value="${esc(editing?.[f.key] ?? '')}">`).join('')}
                        <select id="jf-status" title="Durum">
                            ${STATUS_OPTIONS.map((o) => `
                                <option value="${esc(o.value)}" ${statusValueOf(editing?.status) === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                        </select>
                        <button class="btn btn-primary" id="jf-go">${editing ? 'Kaydet' : 'Ekle'}</button>
                        ${editing ? '<button class="btn btn-outline" id="jf-cancel">Vazgeç</button>' : ''}
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>İş No</th>
                                    <th>Ürün / Kalem</th>
                                    <th>Adet</th>
                                    <th>Talep Tarihi</th>
                                    <th>Verilen Malzeme</th>
                                    <th>Alınan Miktar</th>
                                    <th>Alınma Tarihi</th>
                                    <th>Fiyat</th>
                                    <th>Durum</th>
                                    <th>Not</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${jobs.length === 0
                                    ? '<tr><td colspan="11" style="text-align:center;color:var(--text-muted)">Aktif fason iş emri yok.</td></tr>'
                                    : jobs.map((j) => renderRow(j)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;

            const form = pane.querySelector('#job-form');
            const readForm = () => ({
                ...Object.fromEntries(FORM_FIELDS.map((f) => [f.key, pane.querySelector(`#jf-${f.key}`).value.trim()])),
                status: pane.querySelector('#jf-status').value,
            });

            pane.querySelector('#btn-job-add').addEventListener('click', () => {
                if (editId != null) { editId = null; draw(); return; }
                form.hidden = !form.hidden;
            });
            pane.querySelector('#jf-go').addEventListener('click', async () => {
                const fields = readForm();
                if (editId != null) {
                    await updateOutsourceJob(editId, fields);
                    showToast(`Güncellendi: ${fields.item}`);
                    editId = null;
                } else {
                    const res = await addOutsourceJob(fields);
                    if (!res.ok) { showToast(res.error); return; }
                    showToast(`Fason iş açıldı: ${res.job.item}`);
                }
                draw();
            });
            pane.querySelector('#jf-cancel')?.addEventListener('click', () => { editId = null; draw(); });

            pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
                editId = b.dataset.edit; draw();
            }));
            pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
                const job = jobs.find((j) => String(j.id) === String(b.dataset.del));
                if (!confirm(`"${job?.item ?? '?'}" fason işi silinsin mi?`)) return;
                await deleteOutsourceJob(b.dataset.del);
                showToast('Fason iş silindi.');
                draw();
            }));
        };
        await draw();
    },
};

function renderRow(j) {
    const val = statusValueOf(j.status);
    const pill = {
        '': ['outsource-status-pending', 'Açık'],
        'gonderildi': ['outsource-status-gonderildi', 'Gönderildi'],
        'uretimde': ['outsource-status-uretimde', 'Üretimde'],
        '✅': ['outsource-status-teslim_alindi', 'Teslim Alındı'],
    }[val];

    const cell = (v) => {
        const s = String(v ?? '').trim();
        return s ? esc(s) : '—';
    };

    // Eski sample alan adlarıyla da uyumlu kal (item/partner/sentDate/dueDate).
    const item = j.item ?? j.name ?? '';
    const reqDate = j.reqDate ?? j.sentDate ?? '';
    const receivedDate = j.receivedDate ?? j.dueDate ?? '';

    return `
        <tr>
            <td class="mono" style="color:var(--text-muted)">${cell(j.id)}</td>
            <td style="font-weight:600;color:#fff">${cell(item)}</td>
            <td class="mono" style="font-weight:700">${cell(j.qty)}</td>
            <td class="mono" style="font-size:0.75rem">${cell(reqDate)}</td>
            <td style="color:var(--text-secondary);font-size:0.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cell(j.givenMat)}</td>
            <td class="mono">${cell(j.receivedQty)}</td>
            <td class="mono" style="font-size:0.75rem">${cell(receivedDate)}</td>
            <td class="mono">${cell(j.price)}</td>
            <td><span class="outsource-status-pill ${pill[0]}">${pill[1]}</span></td>
            <td style="color:var(--text-secondary);font-size:0.75rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cell(j.note)}</td>
            <td class="row-actions">
                <button class="row-edit" data-edit="${j.id}" title="Düzenle">✎</button>
                <button class="row-del" data-del="${j.id}" title="Sil">✕</button>
            </td>
        </tr>`;
}
