// Üretim Planlama — v2 4 kolonlu board (Planlı/Üretimde/Havuz Testi/Bitmiş)
// + emir detayı (aşama değiştirme in-memory, havuz testi kalibrasyon formu).
// Veri: ops.json productionArchive boş -> store.js sample emirlerini kullanır.
import {
    getProductionOrders, getProductionOrderById, setOrderStage,
    savePoolMetrics, saveOutsourceMetrics, getPoolSampleMetrics, stageLabel,
} from '../data/store.js';
import { esc } from './helpers.js';
import { showToast } from '../main.js';

const STAGES = ['planli', 'uretimde', 'havuz_testi', 'bitmis'];
const STAGE_TITLES = {
    planli: 'Planlı',
    uretimde: 'Üretimde',
    havuz_testi: '🏊 Havuz Testi',
    bitmis: 'Bitmiş / Depoda',
};

// ---------------------------------------------------------------------------
// BOARD  (#/uretim)
// ---------------------------------------------------------------------------
export const productionBoardView = {
    title: 'Üretim Planlama & Havuz Testi',
    subtitle: 'Planlama, montaj ve kalibrasyon süreçlerinin kontrol tahtası.',

    async render(pane) {
        const orders = await getProductionOrders();

        pane.innerHTML = `
            <div class="production-header-controls">
                <p>Fıskiye kontrol sistemleri, DMX aydınlatmalar ve pompa istasyonları üretim hattı kontrolü.</p>
                <button class="btn btn-primary" data-new-order>Yeni Üretim Emri</button>
            </div>

            <div class="production-board">
                ${STAGES.map((stage) => {
                    const inStage = orders.filter((o) => o.stage === stage);
                    const glow = stage === 'havuz_testi' ? 'border-glow-blue' : '';
                    const titleCls = stage === 'havuz_testi' ? 'text-blue' : '';
                    const countCls = stage === 'havuz_testi' ? 'badge-cyan' : '';
                    return `
                    <div class="board-column bg-glass ${glow}">
                        <div class="column-header">
                            <h3 class="${titleCls}">${STAGE_TITLES[stage]}</h3>
                            <span class="column-count ${countCls}">${inStage.length}</span>
                        </div>
                        <div class="column-cards">
                            ${inStage.length === 0
                                ? '<p style="color:var(--text-muted);font-size:0.75rem">Emir yok.</p>'
                                : inStage.map((o) => `
                                    <div class="prod-card" data-order-id="${esc(o.id)}">
                                        <span class="prod-card-id">${esc(o.id)}</span>
                                        <h4 class="prod-card-title">${esc(o.product)}</h4>
                                        <div class="prod-card-meta">
                                            <span class="prod-card-station-pill" title="${esc(o.project)}">${esc(o.project)}</span>
                                            <span class="prod-card-qty">${o.qty} Adet</span>
                                        </div>
                                        <div class="prod-card-meta" style="margin-top:6px">
                                            <span>Hedef</span>
                                            <span class="mono">${esc(o.due || '—')}</span>
                                        </div>
                                    </div>`).join('')}
                        </div>
                    </div>`;
                }).join('')}
            </div>`;

        pane.querySelector('[data-new-order]').addEventListener('click', () => {
            showToast('Yeni üretim emri formu Faz 1 ile (Supabase) aktif olacak.');
        });

        pane.querySelectorAll('[data-order-id]').forEach((card) => {
            card.addEventListener('click', () => { location.hash = `#/uretim/emir/${card.dataset.orderId}`; });
        });
    },
};

// ---------------------------------------------------------------------------
// EMİR DETAYI  (#/uretim/emir/<id>)
// ---------------------------------------------------------------------------
export const productionDetailView = {
    title: 'İş Emri Detayı',
    subtitle: 'Aşama, kalite ve fason yönetim istasyon bilgileri.',

    async render(pane, params) {
        const order = await getProductionOrderById(params.id);
        if (!order) {
            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-goto="uretim">← Üretim Hattına Dön</button>
                </div>
                <div class="grid-card bg-glass empty-state"><h3>Üretim emri bulunamadı (${esc(params.id)}).</h3></div>`;
            return;
        }

        const draw = async () => {
            const isPoolStage = order.stage === 'havuz_testi';
            const isOutsource = Boolean(order.outsource) || (order.station ?? '').includes('Ömer');

            // Havuz formu ön-değerleri: emre kayıtlıysa onu, değilse ops.json pool
            // gerçek kaydından örnek değerleri kullan (device/sn/currentIdle/currentRun/height).
            let pool = order.pool;
            if (isPoolStage && !pool) {
                const sample = await getPoolSampleMetrics();
                pool = {
                    device: sample.device ?? order.product,
                    sn: sample.sn ?? '',
                    currentIdle: sample.currentIdle ?? sample.current ?? '',
                    currentRun: sample.currentRun ?? '',
                    height: sample.height ?? '',
                    notes: sample.notes || sample.desc || '',
                };
            }

            pane.innerHTML = `
                <div class="detail-actions">
                    <button class="btn btn-outline" data-back-to-board>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Üretim Hattına Dön
                    </button>
                </div>

                <div class="detail-layout">
                    <div class="detail-left bg-glass" style="align-items:stretch">
                        <h2 style="font-size:1.05rem;font-weight:600">Üretim Emri Bilgileri</h2>
                        <div class="detail-meta-list">
                            <div class="meta-item"><strong>Emir Kodu:</strong><span class="mono">${esc(order.id)}</span></div>
                            <div class="meta-item"><strong>Hedef Ürün:</strong><span>${esc(order.product)}</span></div>
                            <div class="meta-item"><strong>Hedef Miktar:</strong><span class="mono">${order.qty} Adet</span></div>
                            <div class="meta-item"><strong>Proje:</strong><span>${esc(order.project || '—')}</span></div>
                            <div class="meta-item"><strong>Hedef Tarih:</strong><span class="mono">${esc(order.due || '—')}</span></div>
                            <div class="meta-item"><strong>Mevcut Aşama:</strong>
                                <span class="stage-badge stage-${esc(order.stage)}">${esc(stageLabel(order.stage))}</span>
                            </div>
                            ${order.note ? `<div class="meta-item"><strong>Not:</strong><span>${esc(order.note)}</span></div>` : ''}
                        </div>

                        <div class="prod-action-section margin-top-lg">
                            <h3>Aşama Güncelle</h3>
                            <div class="adjust-actions flex-wrap gap-sm">
                                <button class="btn btn-outline" data-stage="planli">Planlı Yap</button>
                                <button class="btn btn-outline" data-stage="uretimde">Üretimde Yap</button>
                                <button class="btn btn-primary" data-stage="havuz_testi">Havuz Testi Başlat</button>
                                <button class="btn btn-purple" data-stage="bitmis">Tamamlandı &amp; Depoya Al</button>
                            </div>
                            <p class="card-subtitle" style="margin-top:10px">Aşama değişimi oturum içidir — kalıcı kayıt Faz 1'de (Supabase).</p>
                        </div>
                    </div>

                    <div class="detail-right">
                        ${isPoolStage ? renderPoolForm(pool) : ''}
                        ${isOutsource ? renderOutsourceForm(order) : ''}
                        ${!isPoolStage && !isOutsource ? `
                            <div class="grid-card bg-glass">
                                <div class="card-header">
                                    <h2>İstasyon Bilgisi</h2>
                                    <p class="card-subtitle">Bu aşamada ek form yok. Emir "Havuz Testi" aşamasına alındığında
                                    su altı kalibrasyon formu burada açılır; fason emirlerde Ömer Kablo detay formu görünür.</p>
                                </div>
                            </div>` : ''}
                    </div>
                </div>`;

            pane.querySelector('[data-back-to-board]').addEventListener('click', () => { location.hash = '#/uretim'; });

            // Aşama butonları
            pane.querySelectorAll('[data-stage]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const newStage = btn.dataset.stage;
                    if (newStage === order.stage) {
                        showToast('Emir zaten bu aşamada.');
                        return;
                    }
                    await setOrderStage(order.id, newStage);
                    showToast(`${order.id} aşaması güncellendi: ${stageLabel(newStage)} (oturum içi).`);
                    draw();
                });
            });

            // Havuz testi kaydet
            const poolSave = pane.querySelector('[data-save-pool]');
            if (poolSave) {
                poolSave.addEventListener('click', async () => {
                    await savePoolMetrics(order.id, {
                        device: pane.querySelector('#pool-device').value,
                        sn: pane.querySelector('#pool-sn').value,
                        currentIdle: pane.querySelector('#pool-current-idle').value,
                        currentRun: pane.querySelector('#pool-current-run').value,
                        height: pane.querySelector('#pool-height').value,
                        notes: pane.querySelector('#pool-notes').value,
                    });
                    showToast('Havuz testi parametreleri kaydedildi (oturum içi).');
                });
            }

            // Fason kaydet
            const outSave = pane.querySelector('[data-save-outsource]');
            if (outSave) {
                outSave.addEventListener('click', async () => {
                    await saveOutsourceMetrics(order.id, {
                        contractor: 'Ömer Kablo',
                        rawStatus: pane.querySelector('#out-raw-status').value,
                        deliveryDate: pane.querySelector('#out-delivery-date').value,
                        shipmentQty: pane.querySelector('#out-shipment-qty').value,
                    });
                    showToast('Fason sipariş bilgileri güncellendi (oturum içi).');
                });
            }
        };

        await draw();
    },
};

// Havuz Testi kalibrasyon formu — alan adları ops.json pool gerçek kayıtlarına göre:
// device / sn / currentIdle / currentRun / height (+ notes).
function renderPoolForm(pool) {
    const p = pool ?? {};
    return `
        <div class="grid-card bg-glass">
            <div class="card-header">
                <h2>🏊 Havuz Testi &amp; Su Altı Kalibrasyon Bilgileri</h2>
                <p class="card-subtitle">IP68 sızdırmazlık ve akım kalibrasyon test verileri (örnek değerler gerçek havuz kayıtlarından).</p>
            </div>
            <div class="pool-metrics-form">
                <div class="form-row-2">
                    <div class="form-group">
                        <label>Test Edilen Cihaz</label>
                        <input type="text" id="pool-device" value="${esc(p.device ?? '')}" placeholder="Örn: AquaVario 150W">
                    </div>
                    <div class="form-group">
                        <label>Seri No (SN)</label>
                        <input type="text" id="pool-sn" value="${esc(p.sn ?? '')}" placeholder="Örn: SN 19589161">
                    </div>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label>Boşta Akım (Idle)</label>
                        <input type="text" id="pool-current-idle" value="${esc(p.currentIdle ?? '')}" placeholder="Örn: 0.89mA">
                    </div>
                    <div class="form-group">
                        <label>Çalışma Akımı (Run)</label>
                        <input type="text" id="pool-current-run" value="${esc(p.currentRun ?? '')}" placeholder="Örn: 4.77mA">
                    </div>
                </div>
                <div class="form-group">
                    <label>Su Yüksekliği (Maks.)</label>
                    <input type="text" id="pool-height" value="${esc(p.height ?? '')}" placeholder="Örn: 3M">
                </div>
                <div class="form-group">
                    <label>Kalibrasyon Kalite Notu</label>
                    <textarea id="pool-notes" rows="3" placeholder="Sızdırmazlık o-ringi kontrol edildi, akış stabil...">${esc(p.notes ?? '')}</textarea>
                </div>
                <button class="btn btn-primary" data-save-pool>Test Parametrelerini Kaydet</button>
            </div>
        </div>`;
}

// Fason (Ömer Kablo) detay formu — yalnız fason istasyonlu/işaretli emirlerde.
function renderOutsourceForm(order) {
    const d = order.outsource ?? {};
    return `
        <div class="grid-card bg-glass ${order.stage === 'havuz_testi' ? 'margin-top-lg' : ''}">
            <div class="card-header">
                <h2>🏗️ Fason / Dış Üretim Detayları (Ömer Kablo)</h2>
                <p class="card-subtitle">Hammadde gönderim, sevkiyat ve teslim plan bilgileri.</p>
            </div>
            <div class="pool-metrics-form">
                <div class="form-row-2">
                    <div class="form-group">
                        <label>Fason İmalatçı Firma</label>
                        <input type="text" value="Ömer Kablo" readonly>
                    </div>
                    <div class="form-group">
                        <label>Hammadde Gönderim Durumu</label>
                        <select id="out-raw-status">
                            <option value="sent" ${d.rawStatus === 'sent' ? 'selected' : ''}>Kablo &amp; Soket Gönderildi</option>
                            <option value="pending" ${d.rawStatus === 'pending' || !d.rawStatus ? 'selected' : ''}>Hammadde Hazırlanıyor</option>
                            <option value="none" ${d.rawStatus === 'none' ? 'selected' : ''}>Gerekmiyor</option>
                        </select>
                    </div>
                </div>
                <div class="form-row-2">
                    <div class="form-group">
                        <label>Fason Teslim Tarihi Planı</label>
                        <input type="date" id="out-delivery-date" value="${esc(d.deliveryDate ?? '')}">
                    </div>
                    <div class="form-group">
                        <label>Sevk Edilen Paket / Adet</label>
                        <input type="text" id="out-shipment-qty" value="${esc(d.shipmentQty ?? '')}" placeholder="Örn: 200 set parça">
                    </div>
                </div>
                <button class="btn btn-primary" data-save-outsource>Fason Bilgilerini Güncelle</button>
            </div>
        </div>`;
}
