// Çekilecek Foto listesi — fotoğrafı olmayan bitmiş ürünler (Faz 0 çekim planı).
// Salih bu sırayla çekim yapacak; dosya public/foto altına konur, ürün
// detayındaki "Foto dosya adı" alanına adı yazılır.
import { getMissingPhotoItems } from '../data/store.js';
import { esc, iconForFamily } from './helpers.js';

export const missingPhotoView = {
    title: 'Çekilecek Fotoğraflar',
    subtitle: 'Fotoğrafı olmayan bitmiş ürünler — çekim bu liste sırasıyla yapılır.',

    async render(pane) {
        const items = await getMissingPhotoItems();

        pane.innerHTML = `
            <div class="grid-card bg-glass">
                <div class="card-header flex-row">
                    <div>
                        <h2>📷 Çekilecek Foto <span class="count-chip">${items.length}</span></h2>
                        <p class="card-subtitle">Çekim reçetesi: ürün etiketi kadrajda olsun · dosyayı <span class="mono">public/foto</span> klasörüne koy ·
                        ürün detayındaki "Foto dosya adı" alanına dosya adını yaz (ör. <span class="mono">99.jpg</span>).</p>
                    </div>
                    <button class="btn btn-outline" data-goto="g/finished">Bitmiş Ürünler →</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>Sıra</th><th></th><th>Ürün</th><th>Kod/ID</th><th>Stok</th><th>Not</th></tr></thead>
                        <tbody>
                            ${items.length ? items.map((p, k) => `
                            <tr data-item-id="${p.id}" style="cursor:pointer">
                                <td class="mono">${k + 1}</td>
                                <td class="table-thumbnail-cell"><span class="table-placeholder-ico">${iconForFamily(p.family)}</span></td>
                                <td class="strong">${esc(p.name)}</td>
                                <td class="mono">#${p.id}</td>
                                <td class="mono">${p.qty}</td>
                                <td style="color:var(--text-secondary);font-size:0.75rem">${esc(p.note || '—')}</td>
                            </tr>`).join('')
                            : '<tr><td colspan="6" class="empty-row">Eksik foto yok — tüm bitmiş ürünlerin fotoğrafı var. 🎉</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>`;

        pane.querySelectorAll('tr[data-item-id]').forEach((tr) => {
            tr.addEventListener('click', () => { location.hash = `#/stok/urun/${tr.dataset.itemId}`; });
        });
    },
};
