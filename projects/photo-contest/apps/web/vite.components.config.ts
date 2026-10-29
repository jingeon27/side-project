import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./test/browser', import.meta.url)),
  envDir: false,
  esbuild: { jsx: 'automatic' },
  css: { postcss: fileURLToPath(new URL('./', import.meta.url)) },
  server: { host: '127.0.0.1', port: 3349, strictPort: true },
});
