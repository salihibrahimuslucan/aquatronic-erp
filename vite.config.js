import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tek dosyalik build: cikti her seyi gomulu tasir, file:// uzerinden acilabilir
// (Chart.js + fontlar CDN'den gelir). Iki hedef:
//   `vite build`               -> dist/index.html        (tam surum, satis dahil)
//   `vite build --mode uretim` -> dist-uretim/index.html (satissiz uretim paketi;
//        tools/build-uretim.mjs sizinti taramasindan gecirip dist/uretim.html yapar)
// '@sales' alias'i mode'a gore sales-on/sales-off dosyasina cozulur; boylece CRM
// gorunumleri + crm-store + crm-snapshot.json uretim paketinin modul grafigine
// hic girmez (musteri/teklif/fiyat verisi sizamaz).
export default defineConfig(({ mode }) => {
    const withSales = mode !== 'uretim';
    return {
        base: './',
        plugins: [viteSingleFile()],
        resolve: {
            alias: {
                '@sales': fileURLToPath(new URL(
                    withSales ? './src/sales/sales-on.js' : './src/sales/sales-off.js',
                    import.meta.url,
                )),
            },
        },
        build: { outDir: withSales ? 'dist' : 'dist-uretim' },
    };
});
