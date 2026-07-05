// SATIŞ modülü KAPALI varyantı — build:uretim (mode=uretim) buna bağlanır.
// crm.js / crm-store.js / crm-snapshot.json buradan import EDİLMEZ; böylece
// rollup satış kodunu ve müşteri/fiyat verisini üretim paketine hiç koymaz.
export const WITH_SALES = false;
export const crmPipelineView = null;
export const crmDealView = null;
export const crmLogView = null;
export async function getOpenOpportunityCount() { return null; }
export function salesNavHtml() { return ''; }
