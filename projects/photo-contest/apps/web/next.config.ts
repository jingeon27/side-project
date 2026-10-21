import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../../../..'),
  // Next 16 dev 서버는 distDir마다 잠금을 건다. e2e는 다른 distDir(.next/e2e)로 띄워 사용자의 dev 서버와 겹치지 않게 한다.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // 격리 API로 다시 실행하는 e2e는 이전 컴파일 상태를 이어받지 않는다.
  ...(process.env.NEXT_DIST_DIR?.startsWith('.next/e2e')
    ? { experimental: { turbopackFileSystemCacheForDev: false } }
    : {}),
  // 워크스페이스 패키지는 TypeScript 소스를 그대로 내보낸다.
  transpilePackages: ['@photo-contest/bridge', '@side/design-system'],
  async rewrites() {
    return [
      // 브라우저·앱 WebView는 같은 origin의 /backend/*로만 API를 부른다(세션 쿠키가 first-party로 붙는다).
      { source: '/backend/:path*', destination: `${process.env.API_URL || 'http://127.0.0.1:4200'}/:path*` },
    ];
  },
};

export default config;
