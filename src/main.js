import { overviewView } from './views/overview.js';
import { stockListView, stockDetailView } from './views/stock.js';
import { ledgerView } from './views/ledger.js';
import { productionBoardView, productionDetailView } from './views/production.js';
import { outsourceView } from './views/outsource.js';
import { crmPipelineView, crmDealView, crmLogView } from './views/crm.js';
import { getKpis } from './data/store.js';

// Route tablosu: her giriş { pattern, view } — pattern ':id' segmentini destekler.
const ROUTES = [
    { pattern: 'genel', view: overviewView },
    { pattern: 'stok', view: stockListView },
    { pattern: 'stok/urun/:id', view: stockDetailView },
    { pattern: 'defter', view: ledgerView },
    { pattern: 'uretim', view: productionBoardView },
    { pattern: 'uretim/emir/:id', view: productionDetailView },
    { pattern: 'fason', view: outsourceView },
    { pattern: 'crm', view: crmPipelineView },
    { pattern: 'crm/deal/:id', view: crmDealView },
    { pattern: 'crm/log', view: crmLogView },
];

const root = document.getElementById('view-root');

function matchRoute(hash) {
    const path = hash.replace(/^#\//, '').replace(/\/+$/, '');
    const segments = path.split('/').filter(Boolean);

    for (const route of ROUTES) {
        const routeSegments = route.pattern.split('/');
        if (routeSegments.length !== segments.length) continue;

        const params = {};
        let matched = true;
        for (let i = 0; i < routeSegments.length; i++) {
            const rs = routeSegments[i];
            if (rs.startsWith(':')) {
                params[rs.slice(1)] = segments[i];
            } else if (rs !== segments[i]) {
                matched = false;
                break;
            }
        }
        if (matched) return { view: route.view, params, path };
    }
    return null;
}

// Nav öğesindeki data-view, üst-seviye segmenti işaret eder (ör. "stok" hem
// listeyi hem ürün detayını kapsar) — aktif menü vurgusu bunu kullanır.
function topSegment(path) {
    return path.split('/')[0] || 'genel';
}

async function renderCurrent() {
    const hash = location.hash || '#/genel';
    const match = matchRoute(hash) ?? matchRoute('#/genel');
    const { view, params, path } = match;
    const activeTop = topSegment(path);

    // "crm" ve "crm/log" iki ayrı nav öğesi ama ikisi de "crm" ile başlıyor —
    // tam yol eşleşmesi öncelikli, yoksa üst segment eşleşmesine düş (stok/urun/1 -> "stok" sekmesi aktif).
    const navEls = [...document.querySelectorAll('.nav-item[data-view]')];
    const exactMatch = navEls.find((el) => (el.dataset.view === 'crm-log' ? 'crm/log' : el.dataset.view) === path);
    navEls.forEach((el) => {
        const navTarget = el.dataset.view === 'crm-log' ? 'crm/log' : el.dataset.view;
        const isActive = exactMatch ? el === exactMatch : navTarget === activeTop;
        el.classList.toggle('active', isActive);
    });

    document.getElementById('page-title-text').textContent = view.title ?? '';
    document.getElementById('page-subtitle-text').textContent = view.subtitle ?? '';

    root.innerHTML = '';
    const pane = document.createElement('section');
    pane.className = 'view-pane';
    root.appendChild(pane);
    await view.render(pane, params);

    // Görünüm içi "başka rotaya git" düğmeleri/linkleri
    pane.querySelectorAll('[data-goto]').forEach((el) => {
        el.addEventListener('click', () => { location.hash = `#/${el.dataset.goto}`; });
    });
}

async function updateNavBadges() {
    try {
        const kpis = await getKpis();
        const kritik = document.getElementById('nav-badge-kritik');
        const uretim = document.getElementById('nav-badge-uretim');
        if (kritik) {
            if (kpis.criticalCount > 0) { kritik.hidden = false; kritik.textContent = kpis.criticalCount; }
            else kritik.hidden = true;
        }
        if (uretim) {
            if (kpis.openOrderCount > 0) { uretim.hidden = false; uretim.textContent = kpis.openOrderCount; }
            else uretim.hidden = true;
        }
    } catch (err) {
        console.error('Nav rozetleri güncellenemedi:', err);
    }
}

export function showToast(message) {
    const toast = document.getElementById('toast-notif');
    document.getElementById('toast-text').textContent = message;
    toast.classList.add('active');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('active'), 3000);
}

function initClock() {
    const el = document.getElementById('live-time');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleTimeString('tr-TR'); };
    tick();
    setInterval(tick, 1000);
}

window.addEventListener('hashchange', () => { renderCurrent(); updateNavBadges(); });
initClock();
renderCurrent();
updateNavBadges();
