// Görünümlerin ortak küçük yardımcıları (veri erişimi DEĞİL — o store.js'te).
import { familyIcon } from '../data/store.js';

// tabs.json key'lerine göre ikon; eşleşmezse store'daki eski haritaya düş.
const FAMILY_ICONS = {
    pcbcomp: '⚡',
    vario: '💧',
    powerbox: '🔌',
    lighting: '💡',
    pcbcard: '📟',
    xhsocket: '🔗',
    box: '📦',
    finished: '🎛️',
    cable: '〰️',
    pano: '🗄️',
    nozzle: '🌀',
    chemical: '🧪',
    switch: '⚙️',
    motor: '🔩',
    enclosure: '🛡️',
};

export function iconForFamily(key) {
    return FAMILY_ICONS[key] ?? familyIcon(key);
}

// items.json'da photo "foto/1.jpg" olarak duruyor; dosyalar public/foto altında
// olduğundan kök-göreli URL'ye çevir.
export function photoUrl(item) {
    if (!item?.photo) return null;
    return '/' + String(item.photo).replace(/^\/+/, '');
}

// Foto yoksa: aile ikonu + ürün adının baş harfi.
export function placeholderHtml(item, large = false) {
    const letter = (item.name || '?').trim().charAt(0).toUpperCase();
    return `
        <div class="card-ph ${large ? 'card-ph-lg' : ''}">
            <span class="ph-ico">${iconForFamily(item.family)}</span>
            <span class="ph-letter">${esc(letter)}</span>
        </div>`;
}

// stockStatus -> v2 pill sınıfı (Kritik=pink, Azalıyor=amber, Yeterli=green)
export function statusPillClass(status) {
    if (status === 'critical') return 'status-out';
    if (status === 'low') return 'status-warn';
    return 'status-ok';
}

// Basit HTML kaçışı — kullanıcı/veri metni innerHTML'e gömülürken.
export function esc(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Epoch-ms sayı, "17.05.2026" ya da ISO string — hepsini okunur tr-TR'ye çevir.
export function fmtWhen(value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (Number.isFinite(n) && n > 1e11) {
        return new Date(n).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    }
    return String(value);
}
