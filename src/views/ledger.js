// Hareket Defteri — ops.json activityLog kayıtları (uygulama olay günlüğü).
// Gerçek kayıt şekli: {ts(epoch-ms), user, action(kod), target, details}
// store.getActivityLog() normalize eder; yine de alanlara esnek yaklaş.
import { getActivityLog } from '../data/store.js';
import { esc, fmtWhen } from './helpers.js';

// Uygulama olay kodu -> okunur Türkçe etiket + renk yönü
const ACTION_LABELS = {
    'stock-in': { label: 'Stok Girişi', dir: 'in' },
    'stock-out': { label: 'Stok Çıkışı', dir: 'out' },
    'product-edit': { label: 'Ürün Düzenlendi', dir: null },
    'product-add': { label: 'Ürün Eklendi', dir: 'in' },
    'product-delete': { label: 'Ürün Silindi', dir: 'out' },
    'production-start': { label: 'Üretim Başladı', dir: 'in' },
    'production-done': { label: 'Üretim Tamamlandı', dir: 'in' },
    'production-consume': { label: 'Üretim Tüketimi', dir: 'out' },
    'bom-edit': { label: 'Reçete Düzenlendi', dir: null },
    'plan-add': { label: 'Plan Eklendi', dir: 'in' },
    'plan-delete': { label: 'Plan Silindi', dir: 'out' },
    'tab-add': { label: 'Sekme Eklendi', dir: 'in' },
    'tab-delete': { label: 'Sekme Silindi', dir: 'out' },
    'dis-add': { label: 'Fason Kaydı Eklendi', dir: 'in' },
    'Giriş': { label: 'Stok Girişi', dir: 'in' },
    'Çıkış': { label: 'Stok Çıkışı', dir: 'out' },
};

export const ledgerView = {
    title: 'Hareket Defteri',
    subtitle: 'Envanter ve uygulama olaylarının tam günlüğü.',

    async render(pane) {
        const log = await getActivityLog();

        pane.innerHTML = `
            <div class="grid-card bg-glass">
                <div class="card-header flex-row">
                    <div>
                        <h2>Genel Hareket Defteri</h2>
                        <p class="card-subtitle">Sistem genelindeki son işlemler — stok giriş/çıkışları ve uygulama olayları.</p>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Zaman</th>
                                <th>İşlem</th>
                                <th>Ürün / Hedef</th>
                                <th>Miktar</th>
                                <th>Kullanıcı</th>
                                <th>Detay</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${log.length === 0
                                ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Kayıtlı hareket yok.</td></tr>'
                                : log.map((entry) => renderRow(entry)).join('')}
                        </tbody>
                    </table>
                </div>
                <p class="card-subtitle" style="margin-top:14px">
                    Stok giriş/çıkış ve üretim hareketleri buraya canlı yazılır (tarayıcıda kalıcı) — Faz 1'de Supabase'e taşınacak.
                </p>
            </div>`;
    },
};

function renderRow(entry) {
    // Zaman: normalize date alanı epoch-ms sayısı olabilir; ham ts de gelebilir.
    const when = fmtWhen(entry.date ?? entry.ts);

    // İşlem: bilinen kodları etikete çevir, bilinmeyeni ham kod olarak göster.
    const rawAction = entry.action ?? '—';
    const known = ACTION_LABELS[rawAction];
    const label = known?.label ?? rawAction;
    const dirClass = known?.dir === 'in' ? 'badge-cyan' : (known?.dir === 'out' ? 'badge-purple' : 'badge-muted');

    // Hedef: normalize 'product' alanı boş/— ise ham target'a düş.
    const target = (entry.product && entry.product !== '—') ? entry.product : (entry.target ?? '—');

    const qty = entry.qty ?? '—';
    const note = entry.note || entry.details || '';

    return `
        <tr>
            <td class="mono" style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap">${esc(when)}</td>
            <td>
                <span class="badge ${dirClass}" style="margin-left:0">${esc(label)}</span>
                ${known ? '' : `<span class="mono" style="font-size:0.65rem;color:var(--text-muted)"> ${esc(rawAction)}</span>`}
            </td>
            <td style="font-weight:600;color:#fff">${esc(target)}</td>
            <td class="mono" style="font-weight:700">${esc(qty)}</td>
            <td>${esc(entry.user ?? '—')}</td>
            <td style="color:var(--text-secondary);font-size:0.75rem;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(note || '—')}</td>
        </tr>`;
}
