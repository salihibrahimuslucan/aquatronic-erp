import {
    getKpis, getCriticalItems, getMoves, getWeeklyMoveTotals, formatMoney,
} from '../data/store.js';

let chart;

export const overviewView = {
    id: 'genel',
    title: 'Genel Bakış',
    headerAction: null,

    async render(root) {
        const [kpis, critical, moves, weekly] = await Promise.all([
            getKpis(), getCriticalItems(), getMoves(), getWeeklyMoveTotals(),
        ]);

        root.innerHTML = `
            <div class="welcome-banner">
                <div class="welcome-text">
                    <h1>Hoş geldin, Salih</h1>
                    <p>Stok, üretim ve satış hattının güncel durumu.</p>
                </div>
                <div class="live-clock" id="live-clock">--:--:--</div>
            </div>

            <div class="kpi-grid">
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-cyan">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Stok Kalemi</h3>
                        <p class="kpi-value mono">${kpis.totalItems}</p>
                        <span class="kpi-trend dynamic">Aktif takipte</span>
                    </div>
                </div>
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-purple">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Kritik Seviyede</h3>
                        <p class="kpi-value mono">${kpis.criticalCount}</p>
                        <span class="kpi-trend negative">Sipariş gerektiriyor</span>
                    </div>
                </div>
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-blue">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v4M12 19v4M4.2 4.2l2.9 2.9M16.9 16.9l2.9 2.9M1 12h4M19 12h4M4.2 19.8l2.9-2.9M16.9 7.1l2.9-2.9"></path></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Açık Üretim Emri</h3>
                        <p class="kpi-value mono">${kpis.openOrderCount}</p>
                        <span class="kpi-trend dynamic">Planlı + üretimde + testte</span>
                    </div>
                </div>
                <div class="kpi-card bg-glass">
                    <div class="kpi-icon icon-green">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                    </div>
                    <div class="kpi-info">
                        <h3>Açık Fırsat (CRM)</h3>
                        <p class="kpi-value mono">${kpis.openDealCount}</p>
                        <span class="kpi-trend positive">${formatMoney(kpis.pipelineValue)} pipeline</span>
                    </div>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="grid-card bg-glass col-span-2">
                    <div class="card-header">
                        <h2>Stok Hareketleri</h2>
                        <span class="card-subtitle">Son 4 hafta — giriş / çıkış toplamları</span>
                    </div>
                    <div class="chart-container"><canvas id="moves-chart"></canvas></div>
                </div>
                <div class="grid-card bg-glass">
                    <div class="card-header">
                        <h2>Kritik Stok</h2>
                        <span class="card-subtitle">Kritik seviyenin altındaki kalemler</span>
                    </div>
                    <div class="critical-list">
                        ${critical.slice(0, 6).map((i) => `
                            <div class="critical-row">
                                <div>
                                    <span class="name">${i.name}</span>
                                    <span class="code">${i.code}</span>
                                </div>
                                <span class="qty">${i.qty} <span>/ krt ${i.critical}</span></span>
                            </div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="grid-card bg-glass margin-top-lg">
                <div class="card-header flex-row">
                    <div>
                        <h2>Son Hareketler</h2>
                        <p class="card-subtitle">Hareket defterinin son kayıtları</p>
                    </div>
                    <button class="btn btn-outline" data-goto="stok">Deftere Git</button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>Tarih</th><th>Ürün</th><th>Tip</th><th>Adet</th><th>Referans</th><th>Not</th></tr>
                        </thead>
                        <tbody>
                            ${moves.slice(0, 8).map((m) => `
                                <tr>
                                    <td class="mono">${m.date}</td>
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

        this.startClock(root);
        this.drawChart(weekly);
    },

    startClock(root) {
        const el = root.querySelector('#live-clock');
        const tick = () => {
            if (!el.isConnected) { clearInterval(timer); return; }
            el.textContent = new Date().toLocaleTimeString('tr-TR');
        };
        const timer = setInterval(tick, 1000);
        tick();
    },

    drawChart(weekly) {
        if (chart) { chart.destroy(); chart = null; }
        const ctx = document.getElementById('moves-chart');
        if (!ctx || typeof Chart === 'undefined') return;
        chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekly.map((w) => w.label),
                datasets: [
                    {
                        label: 'Giriş',
                        data: weekly.map((w) => w.giris),
                        backgroundColor: 'rgba(0, 245, 212, 0.55)',
                        borderColor: '#00f5d4',
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                    {
                        label: 'Çıkış',
                        data: weekly.map((w) => w.cikis),
                        backgroundColor: 'rgba(247, 37, 133, 0.45)',
                        borderColor: '#f72585',
                        borderWidth: 1,
                        borderRadius: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } },
                },
                scales: {
                    x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                },
            },
        });
    },
};
