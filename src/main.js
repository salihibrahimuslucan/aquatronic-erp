import { stockGroupView, stockDetailView } from './views/stock.js';
import { activeView, plannedView, poolView } from './views/operations.js';
import { outsourceView } from './views/outsource.js';
import { ledgerView } from './views/ledger.js';
import { missingPhotoView } from './views/photos.js';
import { WITH_SALES, crmPipelineView, crmDealView, crmLogView, salesNavHtml } from '@sales';
import { getOpGroups, getGroup, setCurrentUser } from './data/store.js';
import { isCloud, getProfile, signIn, signOut } from './data/supabase.js';

// Girişli kullanıcı profili (bulut modu) — satış menüsü rol'e de bakar:
// üretim rolü tam pakette bile CRM görmez (derinlemesine savunma; asıl duvar
// build:uretim + Supabase RLS).
let userProfile = null;
const ROLE_LABEL = { yonetici: 'Yönetici', uretim: 'Üretim', satis: 'Satış' };
function salesAllowed() {
    return WITH_SALES && (!userProfile || userProfile.role !== 'uretim');
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
    dis: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    pool: '<path d="M2 12h20M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"></path>',
    defter: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
    crm: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 3h-6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path>',
    crmlog: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    cart: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
    money: '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
    hr: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>',
};
function svg(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nav-icon">${ICON[name] ?? ''}</svg>`;
}

// ─── Sidebar menüsünü store'daki OP_GROUPS'tan üret ─────────────────────────
function buildNav() {
    const ops = getOpGroups();
    const opLinks = [
        ...ops.map((g) => `<a href="#/g/${g.id}" class="nav-item" data-nav="g/${g.id}">${svg(g.icon)}<span>${g.label}</span></a>`),
        `<a href="#/defter" class="nav-item" data-nav="defter">${svg('defter')}<span>Hareket Defteri</span></a>`,
    ].join('');

    const salesLinks = salesAllowed() ? salesNavHtml(svg) : '';

    document.getElementById('nav-menu').innerHTML = `
        <div class="nav-separator">Operasyon</div>
        ${opLinks}
        ${salesLinks}
        <div class="nav-separator">Sonraki Fazlar</div>
        <a class="nav-item disabled" tabindex="-1">${svg('cart')}<span>Satın Alma</span><span class="badge badge-muted">Faz</span></a>
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
    if (seg[0] === 'defter') return { view: ledgerView, params: {}, navKey: 'defter' };
    if (seg[0] === 'foto-eksik') return { view: missingPhotoView, params: {}, navKey: 'g/finished' };
    if (salesAllowed() && seg[0] === 'crm' && seg[1] === 'deal' && seg[2]) return { view: crmDealView, params: { id: seg[2] }, navKey: 'crm' };
    if (salesAllowed() && seg[0] === 'crm' && seg[1] === 'log') return { view: crmLogView, params: {}, navKey: 'crm/log' };
    if (salesAllowed() && seg[0] === 'crm') return { view: crmPipelineView, params: {}, navKey: 'crm' };
    return homeRoute();
}

async function renderCurrent() {
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
        document.getElementById('login-go').addEventListener('click', tryLogin);
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
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
}

async function boot() {
    if (isCloud()) {
        userProfile = await getProfile().catch(() => null);
        if (!userProfile) userProfile = await showLogin();
        setCurrentUser(userProfile.full_name);
        renderUserFooter();
    }
    buildNav();
    window.addEventListener('hashchange', renderCurrent);
    initClock();
    renderCurrent();
}
boot();
