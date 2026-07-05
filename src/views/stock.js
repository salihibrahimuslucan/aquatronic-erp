import { getItems, getMoves, stockStatus } from '../data/store.js';

const STATUS_BADGE = {
    ok: '<span class="stock-badge stock-ok">Yeterli</span>',
    low: '<span class="stock-badge stock-low">Azalıyor</span>',
    critical: '<span class="stock-badge stock-critical">Kritik</span>',
};

export const stockView = {
    id: 'stok',
    title: 'Stok',
    headerAction: 'Yeni Hareket',

    async render(root) {
        const [items, moves] = await Promise.all([getItems(), getMoves()]);
        const categories = [...new Set(items.map((i) => i.category))].sort();

        root.innerHTML = `
            <div class="view-header">
                <div>
                    <h1>Stok</h1>
                    <p>Kalem listesi, kritik seviye takibi ve hareket defteri.</p>
                </div>
                <div class="filter-bar">
                    <input type="text" id="stock-search" placeholder="Ad veya kod ara...">
                    <select id="stock-category">
                        <option value="">Tüm Kategoriler</option>
                        ${categories.map((c) => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <select id="stock-status">
                        <option value="">Tüm Durumlar</option>
                        <option value="ok">Yeterli</option>
                        <option value="low">Azalıyor</option>
                        <option value="critical">Kritik</option>
                    </select>
                </div>
            </div>

            <div class="grid-card bg-glass">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>Kod</th><th>Ürün</th><th>Kategori</th><th>Stok</th><th>Kritik Sev.</th><th>Durum</th></tr>
                        </thead>
                        <tbody id="stock-table-body"></tbody>
                    </table>
                </div>
            </div>

            <h2 class="section-title">Hareket Defteri
                <span class="card-subtitle">Her giriş/çıkış tek satır — ledger, geriye dönük değiştirilmez</span>
            </h2>
            <div class="grid-card bg-glass">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>Tarih</th><th>Kod</th><th>Ürün</th><th>Tip</th><th>Adet</th><th>Referans</th><th>Not</th></tr>
                        </thead>
                        <tbody>
                            ${moves.map((m) => `
                                <tr>
                                    <td class="mono">${m.date}</td>
                                    <td class="mono">${m.code}</td>
                                    <td>${m.name}</td>
                                    <td class="${m.type === 'giris' ? 'move-in' : 'move-out'}">${m.type === 'giris' ? '▲ Giriş' : '▼ Çıkış'}</td>
                                    <td class="mono">${m.qty}</td>
                                    <td class="mono">${m.ref}</td>
                                    <td>${m.note}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;

        const tbody = root.querySelector('#stock-table-body');
        const search = root.querySelector('#stock-search');
        const catSel = root.querySelector('#stock-category');
        const statSel = root.querySelector('#stock-status');

        const renderRows = () => {
            const q = search.value.trim().toLowerCase();
            const cat = catSel.value;
            const stat = statSel.value;
            const filtered = items.filter((i) => {
                if (q && !(`${i.name} ${i.code}`.toLowerCase().includes(q))) return false;
                if (cat && i.category !== cat) return false;
                if (stat && stockStatus(i) !== stat) return false;
                return true;
            });
            tbody.innerHTML = filtered.map((i) => `
                <tr>
                    <td class="mono">${i.code}</td>
                    <td>${i.name}</td>
                    <td>${i.category}</td>
                    <td class="mono">${i.qty} ${i.unit}</td>
                    <td class="mono">${i.critical}</td>
                    <td>${STATUS_BADGE[stockStatus(i)]}</td>
                </tr>`).join('')
                || '<tr><td colspan="6" style="color:var(--text-muted)">Eşleşen kalem yok.</td></tr>';
        };

        search.addEventListener('input', renderRows);
        catSel.addEventListener('change', renderRows);
        statSel.addEventListener('change', renderRows);
        renderRows();
    },
};
