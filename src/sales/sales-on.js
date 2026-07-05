// SATIŞ modülü AÇIK varyantı — yalnız tam build (npm run build) buna bağlanır.
// vite.config.js '@sales' alias'ını mode'a göre bu dosyaya ya da sales-off.js'e çözer;
// CRM görünümleri + snapshot verisi pakete YALNIZ bu yoldan girer.
export const WITH_SALES = true;
export { crmPipelineView, crmDealView, crmLogView } from '../views/crm.js';
export { getOpenOpportunityCount } from '../data/crm-store.js';

// Sidebar'in Satis bolumu — svg() main.js'ten gelir. Etiket dizgileri bilerek
// burada: uretim paketinde "CRM" izi minifier'a bakmadan sifir olsun.
export function salesNavHtml(svg) {
    return `
        <div class="nav-separator">Satış</div>
        <a href="#/crm" class="nav-item" data-nav="crm">${svg('crm')}<span>CRM Pipeline</span></a>
        <a href="#/crm/log" class="nav-item" data-nav="crm/log">${svg('crmlog')}<span>Aktivite Günlüğü</span></a>`;
}
