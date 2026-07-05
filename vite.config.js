import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tek dosyalik onizleme build'i: dist/index.html her seyi gomulu tasir,
// file:// uzerinden acilabilir (Chart.js + fontlar CDN'den gelir).
export default defineConfig({
    base: './',
    plugins: [viteSingleFile()],
});
