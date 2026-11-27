import { defineConfig } from 'vite';
import { resolve } from 'path';

// Konfigurasi Vite multi-page untuk halaman Home (index.html) dan Peta (peta.html)
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        peta: resolve(import.meta.dirname, 'peta.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
