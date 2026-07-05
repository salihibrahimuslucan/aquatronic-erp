import { overviewView } from './views/overview.js';
import { stockView } from './views/stock.js';
import { productionView } from './views/production.js';
import { crmView } from './views/crm.js';
import { getKpis } from './data/store.js';

const VIEWS = [overviewView, stockView, productionView, crmView];
const root = document.getElementById('view-root');

function currentViewId() {
    const hash = location.hash.replace('#/', '');
    return VIEWS.some((v) => v.id === hash) ? hash : 'genel';
}

async function renderCurrent() {
    const id = currentViewId();
    const view = VIEWS.find((v) => v.id === id);

    document.querySelectorAll('.nav-item[data-view]').forEach((el) => {
        el.classList.toggle('active', el.dataset.view === id);
    });

    const actionBtn = document.getElementById('btn-header-action');
    const actionLabel = document.getElementById('btn-header-label');
    if (view.headerAction) {
        actionBtn.style.display = '';
        actionLabel.textContent = view.headerAction;
    } else {
        actionBtn.style.display = 'none';
    }

    root.innerHTML = '';
    const pane = document.createElement('section');
    pane.className = 'tab-pane active';
    root.appendChild(pane);
    await view.render(pane);

    // Görünüm içi "başka modüle git" düğmeleri
    pane.querySelectorAll('[data-goto]').forEach((el) => {
        el.addEventListener('click', () => { location.hash = `#/${el.dataset.goto}`; });
    });
}

async function updateNavBadges() {
    const kpis = await getKpis();
    const kritik = document.getElementById('nav-badge-kritik');
    const uretim = document.getElementById('nav-badge-uretim');
    if (kpis.criticalCount > 0) { kritik.hidden = false; kritik.textContent = kpis.criticalCount; }
    if (kpis.openOrderCount > 0) { uretim.hidden = false; uretim.textContent = kpis.openOrderCount; }
}

export function showToast(message) {
    const toast = document.getElementById('toast-notif');
    document.getElementById('toast-text').textContent = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

document.getElementById('btn-header-action').addEventListener('click', () => {
    showToast('Kayıt formları Faz 1 ile (Supabase) aktif olacak.');
});

window.addEventListener('hashchange', renderCurrent);
renderCurrent();
updateNavBadges();
