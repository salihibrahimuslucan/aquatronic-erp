// Fason Üretim — outsource.json'daki gerçek Ömer Kablo işleri (v2 tablo kalıbı).
// Gerçek alanlar: id / item / qty / status ('' | '✅') / reqDate / givenMat /
// receivedQty / receivedDate / price / note — boş alanlar '—' ile basılır.
import { getOutsourceJobs } from '../data/store.js';
import { esc } from './helpers.js';

export const outsourceView = {
    title: 'Fason Üretim',
    subtitle: 'Dış kablolama ve montaj ortaklığındaki (Ömer Kablo) iş emirleri.',

    async render(pane) {
        const jobs = await getOutsourceJobs();

        pane.innerHTML = `
            <div class="grid-card bg-glass">
                <div class="card-header flex-row">
                    <div>
                        <h2>🏗️ Fason Üretim Takip Paneli (Ömer Kablo)</h2>
                        <p class="card-subtitle">Dış tesiste süren kablo gruplama, konnektör montaj ve reçineleme işleri — ${jobs.length} kayıt.</p>
                    </div>
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
                            </tr>
                        </thead>
                        <tbody>
                            ${jobs.length === 0
                                ? '<tr><td colspan="10" style="text-align:center;color:var(--text-muted)">Aktif fason iş emri yok.</td></tr>'
                                : jobs.map((j) => renderRow(j)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    },
};

function renderRow(j) {
    // Statü: '✅' -> teslim alındı; boş -> açık iş. (Eski sample şemasında
    // status 'gonderildi'/'uretimde'/'teslim_alindi' string'leri de gelebilir.)
    const raw = String(j.status ?? '').trim();
    let pillClass = 'outsource-status-pending';
    let pillText = 'Açık';
    if (raw === '✅' || raw === 'teslim_alindi' || raw === 'delivered') {
        pillClass = 'outsource-status-teslim_alindi';
        pillText = 'Teslim Alındı';
    } else if (raw === 'gonderildi' || raw === 'sent') {
        pillClass = 'outsource-status-gonderildi';
        pillText = 'Gönderildi';
    } else if (raw === 'uretimde') {
        pillClass = 'outsource-status-uretimde';
        pillText = 'Üretimde';
    }

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
            <td><span class="outsource-status-pill ${pillClass}">${pillText}</span></td>
            <td style="color:var(--text-secondary);font-size:0.75rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cell(j.note)}</td>
        </tr>`;
}
