import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const casePages = globSync('cases/*/index.html', { cwd: webRoot }).sort();

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    assetsDir: 'bundles',
    rollupOptions: {
      input: ['index.html', 'play/index.html', ...casePages].map((path) => resolve(webRoot, path)),
    },
  },
});
