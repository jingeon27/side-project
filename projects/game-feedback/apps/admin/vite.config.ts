import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

function localAdmin(port: number): Plugin {
  const guard = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (
      req.url?.startsWith('/api') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET') &&
      ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin ?? '')
    ) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ errorCode: 'INVALID_ORIGIN', message: '로컬 관리자 화면에서 요청해주세요.' }));
      return;
    }
    next();
  };
  return {
    name: 'local-admin-origin',
    configureServer: (server) => {
      server.middlewares.use(guard);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(guard);
    },
  };
}
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const port = Number(env.GF_ADMIN_PORT ?? 3303);
  const operatorToken = env.GF_ADMIN_ACCESS_TOKEN;
  if (operatorToken && !/^[A-Za-z0-9_-]{43}$/.test(operatorToken))
    throw new Error('GF_ADMIN_ACCESS_TOKEN is invalid.');
  if (operatorToken && !env.GF_ADMIN_WEB_ORIGIN?.startsWith('https://'))
    throw new Error('Operator mode requires an HTTPS GF_ADMIN_WEB_ORIGIN.');
  const target = new URL(env.GF_ADMIN_API_ORIGIN ?? 'http://localhost:4300');
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.protocol !== 'http:' ||
    target.pathname !== '/' ||
    target.username ||
    target.password
  )
    throw new Error('Admin requires the local Game Feedback API.');
  const proxy = {
    '/api': {
      target: target.origin,
      changeOrigin: true,
      headers: {
        Origin: env.GF_ADMIN_WEB_ORIGIN ?? 'http://localhost:3300',
        ...(operatorToken ? { Authorization: `Bearer ${operatorToken}` } : {}),
      },
    },
  };
  return {
    // Only the mode flag reaches the browser; the credential stays in this local proxy.
    define: { 'import.meta.env.VITE_GF_ADMIN_OPERATOR': JSON.stringify(operatorToken ? 'true' : 'false') },
    plugins: [react(), localAdmin(port)],
    optimizeDeps: { include: ['@game-feedback/contracts'] },
    build: { commonjsOptions: { include: [/node_modules/, /packages\/contracts\/dist/] } },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },
    server: { host: '127.0.0.1', port, strictPort: true, allowedHosts: ['localhost', '127.0.0.1'], proxy },
    preview: { host: '127.0.0.1', port, strictPort: true, allowedHosts: ['localhost', '127.0.0.1'], proxy },
  };
});
