// build:uretim son adimi: dist-uretim/index.html'i satis-verisi sizinti
// taramasindan gecir, temizse dist/uretim.html olarak yayimla.
// Tarama basarisizsa CIKTI YAYIMLANMAZ ve surec 1 ile biter (kabul testi).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'dist-uretim', 'index.html');
const outDir = path.join(root, 'dist');
const out = path.join(outDir, 'uretim.html');

if (!existsSync(src)) {
    console.error(`HATA: ${src} yok — once \`vite build --mode uretim\` calismali.`);
    process.exit(1);
}

const html = readFileSync(src, 'utf8');

// Satis verisi isaretcileri: CRM snapshot'inda kesin gecen dizgiler.
// Biri bile bulunursa uretim paketi yayimlanmaz.
const FORBIDDEN = ['SASHI', 'rohit@', 'crm-snapshot', 'crmAddDeal', 'CRM Pipeline'];
const low = html.toLowerCase();
const hits = FORBIDDEN.filter((m) => low.includes(m.toLowerCase()));

if (hits.length) {
    console.error(`KABUL TESTI BASARISIZ — uretim paketinde satis izi: ${hits.join(', ')}`);
    console.error('dist/uretim.html YAYIMLANMADI.');
    process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(out, html);
rmSync(path.join(root, 'dist-uretim'), { recursive: true, force: true });
console.log(`OK: kabul testi temiz (${FORBIDDEN.length} isaretci, 0 eslesme) -> ${out} (${(html.length / 1024).toFixed(0)} KB)`);
