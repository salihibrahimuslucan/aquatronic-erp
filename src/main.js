import { stockGroupView, stockDetailView } from './views/stock.js';
import { activeView, plannedView, poolView } from './views/operations.js';
import { outsourceView } from './views/outsource.js';
import { purchasingView, purchaseOrderView } from './views/purchasing.js';
import { partnersView, partnerDetailView } from './views/partners.js';
import { ledgerView } from './views/ledger.js';
import { missingPhotoView } from './views/photos.js';
import { reportsView } from './views/reports.js';
import { WITH_SALES, crmPipelineView, crmDealView, crmLogView, salesNavHtml } from '@sales';
import { getOpGroups, getGroup, setCurrentUser } from './data/store.js';
import { isCloud, getProfile, signIn, signOut, updatePassword } from './data/supabase.js';

// Girişli kullanıcı profili (bulut modu) — satış menüsü rol'e de bakar:
// üretim rolü tam pakette bile CRM görmez (derinlemesine savunma; asıl duvar
// build:uretim + Supabase RLS).
let userProfile = null;
const ROLE_LABEL = { yonetici: 'Yönetici', uretim: 'Üretim', satis: 'Satış' };
export function salesAllowed() {
    return WITH_SALES && (!userProfile || userProfile.role !== 'uretim');
}
// Raporlar Paneli yönetici-özel rotası. Bulut-dışı dev'de userProfile null →
// true (geliştirme görebilsin); bulutta yalnız 'yonetici' rolü.
export function managerAllowed() {
    return !userProfile || userProfile.role === 'yonetici';
}

// ─── Menü ikonları (SVG line) ──────────────────────────────────────────────
const ICON = {
    genel: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
    active: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
    planned: '<path d="M9 11H3v10h6V11z"></path><path d="M14 3h-4v18h4V3z"></path><path d="M21 7h-4v14h4V7z"></path>',
    finished: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
    production: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    cable: '<path d="M9 2v6"></path><path d="M15 2v6"></path><path d="M9 8h6v3a3 3 0 0 1-3 3v0a3 3 0 0 1-3-3V8z"></path><path d="M12 14v4a2 2 0 0 0 2 2h1"></path>',
    pano: '<rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line>',
    motor: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>',
    chip: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line>',
    dis: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    pool: '<path d="M2 12h20M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"></path>',
    defter: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
    crm: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 3h-6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path>',
    crmlog: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    cart: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
    cari: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M5 16c0-1.7 1.8-3 4-3s4 1.3 4 3"></path><line x1="15" y1="8" x2="19" y2="8"></line><line x1="15" y1="12" x2="19" y2="12"></line>',
    money: '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
    hr: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>',
    rapor: '<path d="M3 3v18h18"></path><rect x="7" y="12" width="3" height="6"></rect><rect x="12" y="8" width="3" height="10"></rect><rect x="17" y="5" width="3" height="13"></rect>',
};
function svg(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">${ICON[name] ?? ''}</svg>`;
}

// ─── Sidebar menüsünü store'daki OP_GROUPS'tan üret ─────────────────────────
function buildNav() {
    const ops = getOpGroups();
    // Satın Alma + Cari Kartotek, OP_GROUPS akışının parçası değil (özel rota) —
    // Dış Üretim'den hemen sonra, Havuz Testi'nden önce sabit olarak eklenir.
    const opLinks = [
        ...ops.map((g) => {
            const link = `<a href="#/g/${g.id}" class="nav-item" data-nav="g/${g.id}">${svg(g.icon)}<span>${g.label}</span></a>`;
            if (g.id !== 'dis') return link;
            return link
                + `<a href="#/satinalma" class="nav-item" data-nav="satinalma">${svg('cart')}<span>Satın Alma</span></a>`
                + `<a href="#/cari" class="nav-item" data-nav="cari">${svg('cari')}<span>Cari Kartotek</span></a>`;
        }),
        `<a href="#/defter" class="nav-item" data-nav="defter">${svg('defter')}<span>Hareket Defteri</span></a>`,
    ].join('');

    const salesLinks = salesAllowed() ? salesNavHtml(svg) : '';

    // Yönetici-özel: Raporlar Paneli (Genel Bakış'ın geri gelişi DEĞİL — ayrı rota).
    const managerLinks = managerAllowed()
        ? `<div class="nav-separator">Yönetim</div>
        <a href="#/raporlar" class="nav-item" data-nav="raporlar">${svg('rapor')}<span>Raporlar</span></a>`
        : '';

    document.getElementById('nav-menu').innerHTML = `
        <div class="nav-separator">Operasyon</div>
        ${opLinks}
        ${salesLinks}
        ${managerLinks}
        <div class="nav-separator">Sonraki Fazlar</div>
        <a class="nav-item disabled" tabindex="-1">${svg('money')}<span>Muhasebe</span><span class="badge badge-muted">Faz</span></a>
        <a class="nav-item disabled" tabindex="-1">${svg('hr')}<span>İnsan Kaynakları</span><span class="badge badge-muted">Faz</span></a>`;
}

// ─── Router ────────────────────────────────────────────────────────────────
const root = document.getElementById('view-root');

function parseHash() {
    const path = (location.hash || '#/g/active').replace(/^#\/?/, '').replace(/\/+$/, '');
    return path.split('/').filter(Boolean);
}

// Açılış / bilinmeyen rota — Aktif Üretim (Genel Bakış kaldırıldı, eski
// #/genel yer imleri de buraya düşer).
function homeRoute() {
    return { view: activeView, params: { groupId: 'active' }, navKey: 'g/active' };
}

// Rota → { view, params, navKey }
function resolve(seg) {
    if (seg.length === 0 || seg[0] === 'genel') return homeRoute();
    if (seg[0] === 'g' && seg[1]) {
        const g = getGroup(seg[1]);
        if (g) {
            const byType = { stock: stockGroupView, active: activeView, planned: plannedView, outsource: outsourceView, pool: poolView };
            return { view: byType[g.type] ?? stockGroupView, params: { groupId: g.id }, navKey: `g/${g.id}` };
        }
    }
    if (seg[0] === 'stok' && seg[1] === 'urun' && seg[2]) return { view: stockDetailView, params: { id: seg[2] }, navKey: null };
    if (seg[0] === 'satinalma' && seg[1] === 'po' && seg[2]) return { view: purchaseOrderView, params: { id: seg[2] }, navKey: 'satinalma' };
    if (seg[0] === 'satinalma') return { view: purchasingView, params: {}, navKey: 'satinalma' };
    if (seg[0] === 'cari' && seg[1] === 'kart' && seg[2]) return { view: partnerDetailView, params: { id: seg[2] }, navKey: 'cari' };
    if (seg[0] === 'cari') return { view: partnersView, params: {}, navKey: 'cari' };
    if (seg[0] === 'defter') return { view: ledgerView, params: {}, navKey: 'defter' };
    if (managerAllowed() && seg[0] === 'raporlar') return { view: reportsView, params: {}, navKey: 'raporlar' };
    if (seg[0] === 'foto-eksik') return { view: missingPhotoView, params: {}, navKey: 'g/finished' };
    if (salesAllowed() && seg[0] === 'crm' && seg[1] === 'deal' && seg[2]) return { view: crmDealView, params: { id: seg[2] }, navKey: 'crm' };
    if (salesAllowed() && seg[0] === 'crm' && seg[1] === 'log') return { view: crmLogView, params: {}, navKey: 'crm/log' };
    if (salesAllowed() && seg[0] === 'crm') return { view: crmPipelineView, params: {}, navKey: 'crm' };
    return homeRoute();
}

// Mobil burger drawer'ı — gezinmede (nav linki → hashchange) otomatik kapanır.
function closeNavDrawer() {
    document.querySelector('.app-container')?.classList.remove('nav-open');
}

async function renderCurrent() {
    closeNavDrawer();
    const { view, params, navKey } = resolve(parseHash());
    document.querySelectorAll('.nav-item[data-nav]').forEach((el) => {
        el.classList.toggle('active', el.dataset.nav === navKey);
    });
    document.getElementById('page-title-text').textContent = view.title ?? '';
    document.getElementById('page-subtitle-text').textContent = view.subtitle ?? '';

    root.innerHTML = '';
    const pane = document.createElement('section');
    pane.className = 'view-pane';
    root.appendChild(pane);
    await view.render(pane, params);

    pane.querySelectorAll('[data-goto]').forEach((el) => {
        el.addEventListener('click', () => { location.hash = `#/${el.dataset.goto}`; });
    });
}

export function showToast(message) {
    const toast = document.getElementById('toast-notif');
    document.getElementById('toast-text').textContent = message;
    toast.classList.add('active');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('active'), 3200);
}

function initClock() {
    const el = document.getElementById('live-time');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString('tr-TR'); };
    tick();
    setInterval(tick, 1000);
}

// ─── Giriş (bulut modu) ────────────────────────────────────────────────────
function showLogin() {
    const overlay = document.getElementById('login-overlay');
    const errEl = document.getElementById('login-error');
    overlay.hidden = false;
    return new Promise((resolve) => {
        const tryLogin = async () => {
            errEl.hidden = true;
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-pass').value;
            if (!email || !pass) return;
            try {
                const profile = await signIn(email, pass);
                overlay.hidden = true;
                resolve(profile);
            } catch (e) {
                errEl.textContent = /invalid/i.test(e.message)
                    ? 'E-posta ya da şifre hatalı.' : `Giriş başarısız: ${e.message}`;
                errEl.hidden = false;
            }
        };
        // <form> submit: telefon klavyesinin "Git/Enter" tuşu native submit eder →
        // buton klavyenin altında kalsa bile giriş yapılabilir (mobil giriş bug'ı).
        const form = document.getElementById('login-form');
        form.addEventListener('submit', (e) => { e.preventDefault(); tryLogin(); });
        // Emniyet: form yoksa (eski DOM) düğme tıklaması hâlâ çalışsın.
        document.getElementById('login-go').addEventListener('click', (e) => {
            if (!form) { e.preventDefault(); tryLogin(); }
        });
    });
}

// Şifre değiştirme modalı — ekip ortak başlangıç şifresiyle açıldı, herkes
// buradan kendi şifresine geçer (eski şifre sorulmaz; oturum kimliği kanıtlar).
function openPasswordModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-panel bg-glass">
            <div class="modal-head">
                <h2>Şifre Değiştir</h2>
                <button class="modal-close" title="Kapat">✕</button>
            </div>
            <form class="modal-form">
                <div class="form-group"><label>Yeni şifre (en az 8 karakter)</label>
                    <input type="password" id="pw-new" autocomplete="new-password" required minlength="8"></div>
                <div class="form-group"><label>Yeni şifre (tekrar)</label>
                    <input type="password" id="pw-new2" autocomplete="new-password" required minlength="8"></div>
                <p class="modal-error" hidden></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-outline modal-cancel">Vazgeç</button>
                    <button type="submit" class="btn btn-primary">Şifreyi Güncelle</button>
                </div>
            </form>
        </div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.querySelector('.modal-cancel').addEventListener('click', close);

    const form = overlay.querySelector('.modal-form');
    const errEl = overlay.querySelector('.modal-error');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const p1 = overlay.querySelector('#pw-new').value;
        const p2 = overlay.querySelector('#pw-new2').value;
        errEl.hidden = true;
        if (p1 !== p2) {
            errEl.textContent = 'Şifreler birbirini tutmuyor.';
            errEl.hidden = false;
            return;
        }
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Güncelleniyor...';
        try {
            await updatePassword(p1);
            close();
            showToast('Şifre güncellendi — bir sonraki girişte yeni şifre geçerli.');
        } catch (err) {
            errEl.textContent = /same password|different from/i.test(err.message)
                ? 'Yeni şifre eskisiyle aynı olamaz.' : `Güncellenemedi: ${err.message}`;
            errEl.hidden = false;
            btn.disabled = false; btn.textContent = 'Şifreyi Güncelle';
        }
    });
}

function renderUserFooter() {
    if (!userProfile) return;
    const name = userProfile.full_name || 'Kullanıcı';
    document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-role').textContent = ROLE_LABEL[userProfile.role] ?? userProfile.role;
    const btn = document.getElementById('btn-logout');
    btn.hidden = false;
    btn.addEventListener('click', async () => { await signOut(); location.reload(); });
    const pwBtn = document.getElementById('btn-passwd');
    pwBtn.hidden = false;
    pwBtn.addEventListener('click', openPasswordModal);
}

async function boot() {
    if (isCloud()) {
        userProfile = await getProfile().catch(() => null);
        if (!userProfile) userProfile = await showLogin();
        setCurrentUser(userProfile.full_name, userProfile.role);
        renderUserFooter();
    }
    buildNav();
    // Mobil burger: header düğmesi drawer'ı aç/kapa; backdrop tıklaması kapatır.
    const appEl = document.querySelector('.app-container');
    document.getElementById('burger-btn')?.addEventListener('click', () => appEl?.classList.toggle('nav-open'));
    document.getElementById('nav-backdrop')?.addEventListener('click', closeNavDrawer);
    window.addEventListener('hashchange', renderCurrent);
    initClock();
    renderCurrent();
}
boot();
