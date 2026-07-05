// Mock Database for Aquatronic ERP
let projects = [
    { id: '1', code: 'PRJ-26-001', name: 'Barbaros Meydanı Müzikli Fıskiye', client: 'Beşiktaş Belediyesi', location: 'Beşiktaş, İstanbul', stage: 'test', budget: 1450000, progress: 92, status: 'active', date: '2026-02-10' },
    { id: '2', code: 'PRJ-26-002', name: 'Aqua Florya Havuz Animasyon Sistemi', client: 'ECE Türkiye GYO', location: 'Florya, İstanbul', stage: 'completed', budget: 1200000, progress: 100, status: 'active', date: '2026-01-15' },
    { id: '3', code: 'PRJ-26-003', name: 'Gençlik Parkı Işıklı Su Dansı Gösterisi', client: 'Ankara Büyükşehir Bld.', location: 'Ulus, Ankara', stage: 'cabling', budget: 950000, progress: 65, status: 'active', date: '2026-03-01' },
    { id: '4', code: 'PRJ-26-004', name: 'Land of Legends Fıskiye Revizyonu', client: 'Rixos Group', location: 'Serik, Antalya', stage: 'assembly', budget: 1800000, progress: 40, status: 'active', date: '2026-04-12' },
    { id: '5', code: 'PRJ-26-005', name: 'Kordon Boyu Akıllı Su Perdesi', client: 'İzmir Büyükşehir Bld.', location: 'Alsancak, İzmir', stage: 'design', budget: 680000, progress: 20, status: 'paused', date: '2026-05-18' },
    { id: '6', code: 'PRJ-26-006', name: 'Baku Boulevard Musical Water Feature', client: 'Baku City Exec.', location: 'Bakü, Azerbaycan', stage: 'design', budget: 2400000, progress: 15, status: 'active', date: '2026-06-05' }
];

let inventory = [
    { code: 'AQ-PUMP-300', name: 'Aquatronic Fıskiye Pompası (300 L/dk)', type: 'Pompa', stock: 14, minStock: 5, price: '₺18.500', status: 'in_stock', icon: '💧' },
    { code: 'AQ-DMX-RGBW', name: 'DMX Su Altı RGBW LED Aydınlatma (12V)', type: 'Aydınlatma', stock: 3, minStock: 25, price: '₺2.400', status: 'low_stock', icon: '💡' },
    { code: 'AQ-VALVE-24V', name: 'Hızlı Solenoid Akış Valfi (24V)', type: 'Valf', stock: 45, minStock: 15, price: '₺4.100', status: 'in_stock', icon: '⚙️' },
    { code: 'AQ-FLOWCON-8', name: '8 Kanallı Akıllı DMX Akış Kontrol Kartı', type: 'Kontrolör', stock: 2, minStock: 5, price: '₺12.750', status: 'low_stock', icon: '⚡' },
    { code: 'AQ-NOZ-VARIO', name: 'Değişken Açılı Jet Püskürtme Nozulu', type: 'Nozul', stock: 0, minStock: 20, price: '₺1.850', status: 'out_of_stock', icon: '🌀' },
    { code: 'AQ-CABLE-HYD', name: 'IP68 Sualtı Besleme ve Sinyal Kablosu (100m)', type: 'Kablo', stock: 120, minStock: 30, price: '₺6.800', status: 'in_stock', icon: '🔌' }
];

let tickets = [
    {
        id: 'TCK-481',
        title: 'Kadıköy Meydanı DMX Sinyal Kesintisi',
        project: 'Kadıköy Meydanı Fıskiyesi',
        location: 'Kadıköy, İstanbul',
        priority: 'high',
        status: 'Açık',
        date: '2026-07-04',
        tech: 'Ahmet Yılmaz (Kablo Teknisyeni)',
        desc: 'Fıskiye kontrol ünitesindeki DMX512 sinyali, su altındaki ilk LED armatür grubuna iletilmiyor. Işıklar rastgele renklerde kalıyor veya hiç yanmıyor. Kablo bağlantısında IP68 konnektör su almış olabilir.',
        messages: [
            { sender: 'Müşteri Temsilcisi', text: 'Kadıköy Belediyesi işletme şefi sinyal alamadıklarını ve akşam gösterisinin düzgün başlamadığını bildirdi.', time: '07.05.2026 10:15' },
            { sender: 'Ahmet Yılmaz', text: 'Meydana intikal ettim. Test cihazı ile DMX hattını kontrol ediyorum. Muhtemelen 3 numaralı nozul altındaki dağıtıcı kutuda sızıntı var.', time: '07.05.2026 12:45' }
        ]
    },
    {
        id: 'TCK-482',
        title: 'Barbaros Meydanı Pompa 3 Basınç Düşüşü',
        project: 'Barbaros Meydanı Müzikli Fıskiye',
        location: 'Beşiktaş, İstanbul',
        priority: 'medium',
        status: 'Açık',
        date: '2026-07-05',
        tech: 'Caner Şen (Mekanik Teknisyeni)',
        desc: 'Müzik ritmine göre yükselen ana jet fıskiyesini besleyen 3 numaralı pompanın debisi normalin altına düştü. Su yüksekliği 8 metreden 4 metreye geriledi. Emiş süzgecinde tıkanıklık olabilir.',
        messages: [
            { sender: 'Sistem Uyarısı', text: 'Otomatik telemetri izleme: Pompa #3 frekansı 45Hz olmasına rağmen çıkış basıncı 1.8 Bar (Nominal: 3.2 Bar).', time: '07.05.2026 14:02' }
        ]
    }
];

// Active State Management
let currentTab = 'dashboard';
let projectChartInstance = null;
let activeTicketId = null;

// DOM Elements & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabNavigation();
    initCharts();
    renderDashboardRecentProjects();
    renderProjectsTable();
    renderInventoryItems();
    renderTicketList();
    initModalHandlers();
    initFountainSimulationToggle();
});

// 1. Clock Display
function initClock() {
    const clockEl = document.getElementById('live-time');
    setInterval(() => {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString('tr-TR');
    }, 1000);
}

// 2. Tab Navigation
function initTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    
    // Toggle active classes on nav
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Toggle active sections
    const panes = document.querySelectorAll('.tab-pane');
    panes.forEach(pane => {
        pane.classList.remove('active');
    });

    const targetPane = document.getElementById(`${tabId}-tab`);
    if (targetPane) {
        targetPane.classList.add('active');
    }

    // Refresh charts if dashboard is active
    if (tabId === 'dashboard') {
        setTimeout(initCharts, 50);
    }
}

// 3. Chart rendering using Chart.js
function initCharts() {
    const ctx = document.getElementById('projectPipelineChart');
    if (!ctx) return;

    if (projectChartInstance) {
        projectChartInstance.destroy();
    }

    // Count projects in each stage
    const stagesCounts = { design: 0, assembly: 0, cabling: 0, test: 0, completed: 0 };
    projects.forEach(p => {
        if (stagesCounts[p.stage] !== undefined) {
            stagesCounts[p.stage]++;
        }
    });

    projectChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Tasarım & 3D', 'Mekanik Montaj', 'Kablolama', 'Test & Kalibrasyon', 'Tamamlandı'],
            datasets: [{
                label: 'Proje Sayısı',
                data: [
                    stagesCounts.design, 
                    stagesCounts.assembly, 
                    stagesCounts.cabling, 
                    stagesCounts.test, 
                    stagesCounts.completed
                ],
                backgroundColor: [
                    'rgba(0, 187, 249, 0.45)', // Blue
                    'rgba(255, 209, 102, 0.45)', // Yellow
                    'rgba(199, 125, 255, 0.45)', // Cabling/Purple
                    'rgba(247, 37, 133, 0.45)', // Pink
                    'rgba(6, 214, 160, 0.45)'  // Green
                ],
                borderColor: [
                    '#00bbf9',
                    '#ffd166',
                    '#c77dff',
                    '#f72585',
                    '#06d6a0'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#94a3b8',
                        stepSize: 1
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

// 4. Modal Handlers (Add / Edit Project)
function initModalHandlers() {
    const modal = document.getElementById('project-modal');
    const openBtn = document.getElementById('btn-quick-project');
    const openBtnView = document.getElementById('btn-add-project-view');
    const closeBtn = document.getElementById('btn-close-project-modal');
    const cancelBtn = document.getElementById('btn-cancel-project-modal');
    const form = document.getElementById('project-form');

    const openModal = () => {
        form.reset();
        document.getElementById('project-id').value = '';
        document.getElementById('modal-title').innerText = 'Yeni Su Animasyonu Projesi Ekle';
        modal.classList.add('active');
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (openBtnView) openBtnView.addEventListener('click', openModal);

    const closeModal = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const pId = document.getElementById('project-id').value;
        const pName = document.getElementById('p-name').value;
        const pClient = document.getElementById('p-client').value;
        const pLocation = document.getElementById('p-location').value;
        const pStage = document.getElementById('p-stage').value;
        const pBudget = parseFloat(document.getElementById('p-budget').value);
        const pProgress = parseInt(document.getElementById('p-progress').value);
        const pDate = document.getElementById('p-date').value;

        if (pId) {
            // Edit mode
            projects = projects.map(p => p.id === pId ? {
                ...p, name: pName, client: pClient, location: pLocation, stage: pStage, budget: pBudget, progress: pProgress, date: pDate
            } : p);
            showToast('Proje güncellendi');
        } else {
            // Add mode
            const newCode = `PRJ-26-0${projects.length + 1}`;
            const newId = (projects.length + 1).toString();
            projects.push({
                id: newId,
                code: newCode,
                name: pName,
                client: pClient,
                location: pLocation,
                stage: pStage,
                budget: pBudget,
                progress: pProgress,
                status: 'active',
                date: pDate
            });
            showToast('Yeni proje oluşturuldu');
        }

        closeModal();
        renderDashboardRecentProjects();
        renderProjectsTable();
        if (currentTab === 'dashboard') {
            initCharts();
        }
    });
}

// Helper to open Edit Modal for a project
window.editProject = function(id) {
    const p = projects.find(x => x.id === id);
    if (!p) return;

    document.getElementById('project-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-client').value = p.client;
    document.getElementById('p-location').value = p.location;
    document.getElementById('p-stage').value = p.stage;
    document.getElementById('p-budget').value = p.budget;
    document.getElementById('p-progress').value = p.progress;
    document.getElementById('p-date').value = p.date;

    document.getElementById('modal-title').innerText = 'Projeyi Düzenle';
    document.getElementById('project-modal').classList.add('active');
};

// 5. Render Data Sets
function renderDashboardRecentProjects() {
    const container = document.getElementById('dashboard-recent-projects');
    if (!container) return;

    // Show top 3 recent projects
    const topThree = projects.slice(0, 3);
    container.innerHTML = topThree.map(p => {
        const stageLabel = getStageLabel(p.stage);
        const stageClass = `stage-${p.stage}`;
        const formattedBudget = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(p.budget);

        return `
            <tr>
                <td style="font-weight:600;">${p.name}</td>
                <td>${p.location}</td>
                <td style="font-family:'JetBrains Mono';">${p.date}</td>
                <td style="font-family:'JetBrains Mono'; font-weight: 500;">${formattedBudget}</td>
                <td><span class="stage-badge ${stageClass}">${stageLabel}</span></td>
                <td>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${p.progress}%; background: linear-gradient(90deg, var(--color-cyan), var(--color-blue));"></div>
                    </div>
                    <span style="font-size:0.75rem; font-family:'JetBrains Mono';">${p.progress}%</span>
                </td>
                <td>
                    <span class="status-dot status-${p.status === 'active' ? 'active' : 'paused'}"></span>
                    <span>${p.status === 'active' ? 'Aktif' : 'Durduruldu'}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function renderProjectsTable() {
    const container = document.getElementById('projects-table-body');
    if (!container) return;

    const filterVal = document.getElementById('project-stage-filter').value;

    const filtered = filterVal === 'all' ? projects : projects.filter(p => p.stage === filterVal);

    container.innerHTML = filtered.map(p => {
        const stageLabel = getStageLabel(p.stage);
        const stageClass = `stage-${p.stage}`;
        const barColor = p.stage === 'completed' ? 'var(--color-green)' : 'linear-gradient(90deg, var(--color-cyan), var(--color-blue))';

        return `
            <tr>
                <td style="font-family:'JetBrains Mono'; color:var(--text-muted);">${p.code}</td>
                <td style="font-weight:600;">${p.name}</td>
                <td>${p.client}</td>
                <td>${p.location}</td>
                <td><span class="stage-badge ${stageClass}">${stageLabel}</span></td>
                <td style="font-size: 0.75rem;">Mekanik: ✔ / Elektrik: ✔ / Test: ${p.progress > 80 ? '✔' : '⏳'}</td>
                <td>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${p.progress}%; background: ${barColor};"></div>
                    </div>
                    <span style="font-size:0.75rem; font-family:'JetBrains Mono';">${p.progress}%</span>
                </td>
                <td>
                    <div style="display:flex; gap: 8px;">
                        <button class="btn-action-trigger" onclick="editProject('${p.id}')" title="Düzenle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn-action-trigger" onclick="toggleProjectStatus('${p.id}')" title="Durdur/Başlat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Bind project table filter changes
const stageFilterEl = document.getElementById('project-stage-filter');
if (stageFilterEl) {
    stageFilterEl.addEventListener('change', renderProjectsTable);
}

function toggleProjectStatus(id) {
    projects = projects.map(p => {
        if (p.id === id) {
            const nextStatus = p.status === 'active' ? 'paused' : 'active';
            showToast(`${p.name} - Durum: ${nextStatus === 'active' ? 'Aktif' : 'Durduruldu'}`);
            return { ...p, status: nextStatus };
        }
        return p;
    });
    renderDashboardRecentProjects();
    renderProjectsTable();
}

function renderInventoryItems() {
    const container = document.getElementById('inventory-items-container');
    if (!container) return;

    const searchVal = document.getElementById('inventory-search').value.toLowerCase();
    const statusVal = document.getElementById('inventory-status-filter').value;

    let filtered = inventory.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchVal) || item.code.toLowerCase().includes(searchVal);
        const matchesStatus = statusVal === 'all' || item.status === statusVal;
        return matchesSearch && matchesStatus;
    });

    container.innerHTML = filtered.map(item => {
        let statusText = 'Yeterli Stok';
        let statusClass = 'inv-green';
        if (item.status === 'low_stock') {
            statusText = 'Düşük Stok';
            statusClass = 'inv-yellow';
        } else if (item.status === 'out_of_stock') {
            statusText = 'Tükendi';
            statusClass = 'inv-red';
        }

        return `
            <div class="inventory-card bg-glass ${statusClass}">
                <div class="inventory-icon">${item.icon}</div>
                <h3>${item.name}</h3>
                <span class="inv-code">${item.code}</span>
                
                <div class="inv-stock-stats">
                    <div>
                        <span class="inv-meta-label">Birim Fiyat</span>
                        <span class="inv-meta-val">${item.price}</span>
                    </div>
                    <div style="text-align: right;">
                        <span class="inv-meta-label">Stok Durumu</span>
                        <span class="inv-meta-val" style="color: ${item.status==='out_of_stock'?'var(--color-pink)':(item.status==='low_stock'?'var(--color-yellow)':'var(--color-green)')}">${item.stock} Adet (${statusText})</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Bind inventory search & filters
const invSearchEl = document.getElementById('inventory-search');
const invFilterEl = document.getElementById('inventory-status-filter');
if (invSearchEl) invSearchEl.addEventListener('input', renderInventoryItems);
if (invFilterEl) invFilterEl.addEventListener('change', renderInventoryItems);

// 6. Technical Service & Support Tickets Module
function renderTicketList() {
    const container = document.getElementById('ticket-list-container');
    if (!container) return;

    container.innerHTML = tickets.map(t => {
        const selectedClass = t.id === activeTicketId ? 'selected' : '';
        return `
            <div class="ticket-card ${selectedClass}" onclick="selectTicket('${t.id}')">
                <div class="ticket-header">
                    <h4>${t.title}</h4>
                    <span class="ticket-priority-dot priority-${t.priority}"></span>
                </div>
                <div class="ticket-location">${t.project} (${t.location})</div>
                <div class="ticket-footer">
                    <span>Atanan: ${t.tech.split(' ')[0]}</span>
                    <span>Tarih: ${t.date}</span>
                </div>
            </div>
        `;
    }).join('');
}

window.selectTicket = function(id) {
    activeTicketId = id;
    renderTicketList();
    renderTicketDetails();
};

function renderTicketDetails() {
    const panel = document.getElementById('ticket-details-panel');
    if (!panel) return;

    const t = tickets.find(x => x.id === activeTicketId);
    if (!t) {
        panel.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                <h3>Detayları Görüntülemek için Bir Kayıt Seçin</h3>
                <p>İlgili teknik destek talebine atanan teknisyenleri, konuşma loglarını ve donanım değişim geçmişini görebilirsiniz.</p>
            </div>
        `;
        return;
    }

    const priorityLabels = { high: 'Yüksek Öncelik', medium: 'Orta Öncelik', low: 'Düşük Öncelik' };

    panel.innerHTML = `
        <div class="ticket-info-header">
            <div class="ticket-title-row">
                <h2>${t.title}</h2>
                <span class="stage-badge stage-test" style="border: 1px solid var(--border-glass-active);">${priorityLabels[t.priority]}</span>
            </div>
            <p style="color:var(--text-muted); font-size:0.8rem; margin-top: 4px;">Kayıt Kodu: ${t.id} | Lokasyon: ${t.location} | Proje: ${t.project}</p>
        </div>

        <div class="ticket-description">
            <h4 style="color:#ffffff; margin-bottom: 6px; font-size: 0.85rem;">Sorun Açıklaması:</h4>
            <p>${t.desc}</p>
            <span style="font-size: 0.75rem; color: var(--color-cyan); display:block; margin-top: 10px; font-weight: 500;">
                Sorumlu Teknisyen: ${t.tech}
            </span>
        </div>

        <div class="ticket-chat-log" id="ticket-chat-container">
            ${t.messages.map(m => {
                const bubbleSide = m.sender === 'Müşteri Temsilcisi' || m.sender === 'Sistem Uyarısı' ? 'left' : 'right';
                return `
                    <div class="chat-bubble ${bubbleSide}">
                        <strong style="display:block; margin-bottom: 2px; font-size:0.75rem; color: ${bubbleSide==='left'?'var(--color-blue)':'var(--color-cyan)'};">${m.sender}</strong>
                        <p>${m.text}</p>
                        <span class="chat-meta">${m.time}</span>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="ticket-reply-box">
            <input type="text" id="reply-input" placeholder="Teknisyene talimat gönderin veya güncelleme ekleyin...">
            <button class="btn btn-primary" onclick="submitTicketReply()">Gönder</button>
        </div>
    `;

    // Scroll to bottom of chat
    setTimeout(() => {
        const chatContainer = document.getElementById('ticket-chat-container');
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
}

window.submitTicketReply = function() {
    const input = document.getElementById('reply-input');
    if (!input || !input.value.trim()) return;

    const t = tickets.find(x => x.id === activeTicketId);
    if (!t) return;

    const now = new Date();
    const formattedTime = `${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;

    t.messages.push({
        sender: 'Yönetici (Siz)',
        text: input.value.trim(),
        time: formattedTime
    });

    input.value = '';
    renderTicketDetails();
    showToast('Güncelleme teknisyene iletildi');
};

// 7. Fountain Simulation Toggle (Realtime Animation visualizer interaction)
function initFountainSimulationToggle() {
    const visual = document.querySelector('.fountain-visual');
    if (!visual) return;

    visual.addEventListener('click', () => {
        showToast('Su Şovu DMX kalibrasyon sinyali gönderiliyor... (100 FPS)');
        // Simulate high intensity wave heights temporarily
        const waves = document.querySelectorAll('.wave');
        waves.forEach(wave => {
            wave.style.animationDuration = '1.5s';
        });
        setTimeout(() => {
            waves.forEach(wave => {
                wave.style.animationDuration = '';
            });
        }, 4000);
    });
}

// Utility Helpers
function getStageLabel(stage) {
    const labels = {
        design: 'Tasarım & 3D',
        assembly: 'Mekanik Montaj',
        cabling: 'Kablolama',
        test: 'Test & Kalibrasyon',
        completed: 'Tamamlandı'
    };
    return labels[stage] || stage;
}

function showToast(message) {
    const toast = document.getElementById('toast-notif');
    const toastText = document.getElementById('toast-text');
    if (!toast || !toastText) return;

    toastText.innerText = message;
    toast.classList.add('active');

    setTimeout(() => {
        toast.classList.remove('active');
    }, 3000);
}
