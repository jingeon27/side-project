import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./test/browser', import.meta.url)),
  envDir: false,
  define: { 'process.env': '{}' },
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  css: { postcss: fileURLToPath(new URL('./', import.meta.url)) },
  server: { host: '127.0.0.1', port: 3349, strictPort: true },
});
