// Görünümlerin ortak küçük yardımcıları (veri erişimi DEĞİL — o store.js'te).
import { familyIcon } from '../data/store.js';

// Ürün ailesine göre placeholder ikonu (netlify grup ailelerine göre).
const FAMILY_ICONS = {
    finished: '🎛️',
    lighting: '💡',
    vario: '💧',
    switch: '⚙️',
    nozzle: '💦',
    powerbox: '⚡',
    cable: '🔌',
    pano: '🗄️',
    motor: '🔩',
};

export function iconForFamily(key) {
    return FAMILY_ICONS[key] ?? familyIcon(key);
}

// items.json'da photo "foto/1.jpg" (public/foto altında, GÖRELİ — file:// dist'te
// de çalışsın) ya da site içinden yüklenmiş Storage public URL'i olabilir.
export function photoUrl(item) {
    if (!item?.photo) return null;
    const p = String(item.photo);
    if (/^https?:\/\//i.test(p)) return p;
    return p.replace(/^\/+/, '');
}

// ─── Aydınlatma model ayrımı ────────────────────────────────────────────────
// Adında model kodu BARİZ geçen komponent o modelin bölümüne düşer; gerisi
// "Ortak". C'li varyantlar ayrı model sayılır (306 ≠ 306C). Sıra = ekran sırası.
export const LIGHTING_MODELS = ['303', '306', '306C', '406', '406C', '409', '409C'];
export function lightingModelOf(name) {
    const n = String(name ?? '').toUpperCase();
    // Önce C'li varyantlar: "306C" içindeki "306", \b306\b ile eşleşmez ama
    // yine de açık sıra en güvenlisi.
    for (const m of ['306C', '406C', '409C', '306', '406', '409', '303']) {
        if (new RegExp(`\\b${m}\\b`).test(n)) return m;
    }
    return null;
}

// ─── Foto yükleme öncesi istemci tarafı küçültme ───────────────────────────
// Telefon fotoğrafı MB'larca gelir; kovaya en fazla maxDim px, JPEG %85 gider.
export async function compressImage(file, maxDim = 1200, quality = 0.85) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';                 // PNG şeffaflığı siyah basmasın
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
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

// ─── Komponent kaynağı (sourcing köprüsü) ──────────────────────────────────
// Her parça nereden temin edilir: kendi üretim / dış fason / satın alma.
export const SOURCE_META = {
    inhouse:   { label: 'Kendi Üretim', icon: '🏭', cls: 'src-inhouse' },
    outsource: { label: 'Dış Fason',    icon: '🤝', cls: 'src-outsource' },
    purchase:  { label: 'Satın Alma',   icon: '🛒', cls: 'src-purchase' },
};
export function sourceBadge(item) {
    const m = SOURCE_META[item?.sourceType];
    if (!m) return '';
    const sup = item.supplier ? ` · ${esc(item.supplier)}` : '';
    return `<span class="src-badge ${m.cls}" title="Kaynak: ${m.label}${item.supplier ? ' — ' + esc(item.supplier) : ''}">${m.icon} ${m.label}${sup}</span>`;
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
