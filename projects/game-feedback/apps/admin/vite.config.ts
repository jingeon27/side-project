import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';

type TAdminEnv = Record<string, string | undefined>;

// 다른 사이트가 로컬 관리자 화면을 frame으로 띄워 운영 세션으로 클릭을 유도하지 못하게 한다.
export const adminSecurityHeaders = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** API는 프록시가 바꾼 Origin만 보므로 브라우저의 실제 Origin은 이 가드가 확인한다. */
export function localAdminGuard(port: number) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
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
}
function localAdmin(port: number): Plugin {
  const guard = localAdminGuard(port);
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
/** Admin always uses the production SSH tunnel by default; tests may select an isolated loopback API. */
export function adminServerSettings(env: TAdminEnv) {
  const port = Number(env.GF_ADMIN_PORT ?? 3303);
  const target = new URL(env.GF_ADMIN_API_ORIGIN ?? 'http://127.0.0.1:14300');
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.protocol !== 'http:' ||
    target.pathname !== '/' ||
    target.username ||
    target.password
  )
    throw new Error('Admin requires the local Game Feedback API.');
  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target: target.origin,
      changeOrigin: true,
      headers: {
        Origin: env.GF_ADMIN_WEB_ORIGIN ?? 'https://game.bambyul.com',
      },
    },
  };
  return { port, proxy };
}
export default defineConfig(({ mode }) => {
  const { port, proxy } = adminServerSettings({
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  });
  const server = {
    host: '127.0.0.1',
    port,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1'],
    headers: adminSecurityHeaders,
    proxy,
  };
  return {
    plugins: [react(), localAdmin(port)],
    optimizeDeps: { include: ['@game-feedback/contracts'] },
    build: { commonjsOptions: { include: [/node_modules/, /packages\/contracts\/dist/] } },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },
    server,
    preview: server,
  };
});
