// Raporlar Paneli CRM Hunisi kartı — SATIŞ katmanı. Bu dosya yalnız sales-on
// üzerinden (@sales) modül grafiğine girer; böylece "CRM" etiket dizgileri
// (başlık/KPI) build:uretim paketine HİÇ girmez (salesNavHtml ile aynı disiplin).
import { formatMoney } from '../data/store.js';
import { esc } from '../views/helpers.js';

export function renderFunnelCard(funnel) {
    const maxVal = Math.max(1, ...funnel.stages.map((s) => s.totalValue));
    const bars = funnel.stages.length ? funnel.stages.map((s) => {
        const w = Math.round((s.totalValue / maxVal) * 100);
        return `
            <div class="funnel-row" style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                <div style="flex:0 0 190px"><span class="stage-pill stage-await">${esc(s.stage)}</span>
                    <span class="mono text-muted" style="margin-left:6px">×${s.count}</span></div>
                <div style="flex:1;min-width:0">
                    <div style="height:14px;border-radius:7px;background:rgba(255,255,255,0.05);overflow:hidden">
                        <div style="height:100%;width:${w}%;min-width:${s.totalValue > 0 ? '6px' : '0'};background:linear-gradient(90deg,var(--color-cyan),var(--color-blue))"></div>
                    </div>
                </div>
                <div style="flex:0 0 120px;text-align:right" class="mono strong">${esc(formatMoney(s.totalValue))}</div>
            </div>`;
    }).join('') : '<p class="empty-row">Pipeline boş.</p>';

    return `
        <div class="grid-card bg-glass margin-top-lg">
            <div class="card-header">
                <h2>📈 CRM Hunisi <span class="count-chip">${funnel.pipelineCount}</span></h2>
                <p class="card-subtitle">Açık fırsatlar aşamaya göre; bar uzunluğu aşamadaki toplam değeri gösterir.</p>
            </div>
            <div class="kpi-grid" style="margin-bottom:18px">
                <div class="grid-card bg-glass kpi-card">
                    <div class="kpi-info"><h3>Açık Pipeline Değeri</h3>
                        <span class="kpi-value">${esc(formatMoney(funnel.pipelineValue))}</span>
                        <span class="kpi-sub">${funnel.pipelineCount} açık fırsat</span></div>
                </div>
                <div class="grid-card bg-glass kpi-card">
                    <div class="kpi-info"><h3>Kazanılan</h3>
                        <span class="kpi-value text-cyan">${funnel.completedCount}</span>
                        <span class="kpi-sub">${esc(formatMoney(funnel.completedValue))} toplam</span></div>
                </div>
                <div class="grid-card bg-glass kpi-card">
                    <div class="kpi-info"><h3>Kaybedilen</h3>
                        <span class="kpi-value text-pink">${funnel.lostCount}</span>
                        <span class="kpi-sub">kapanmış — kayıp</span></div>
                </div>
            </div>
            <div class="funnel-list">${bars}</div>
        </div>`;
}
