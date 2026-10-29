import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

// cacheComponents(PPR)의 정적 셸은 요청별 nonce를 받을 수 없어 script-src·style-src·default-src를 제한하는 CSP는 두지 않는다.
// 로드 대상(Next 스크립트, Amplitude·Sentry 전송, 업로드·외부 이미지)을 막지 않는 지시어만 둔다.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
];

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../../../', import.meta.url)),
  outputFileTracingExcludes: { '/*': ['../../.data/**'] },
  poweredByHeader: false,
  distDir: process.env.ENVIRONMENT === 'test' ? '.next/test' : '.next',
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Preserve Flight headers so public documents and client navigation can use their own boundaries.
  skipProxyUrlNormalize: true,
  experimental: { exposeTestingApiInProductionBuild: process.env.ENVIRONMENT === 'test' },
  env: {
    GAME_FEEDBACK_CONTACT_EMAIL: process.env.GAME_FEEDBACK_CONTACT_EMAIL ?? '',
    ENVIRONMENT: process.env.ENVIRONMENT || 'development',
    SENTRY_RELEASE: process.env.SENTRY_RELEASE?.trim() || '',
  },
  transpilePackages: ['@game-feedback/contracts', '@game-feedback/sdk', '@side/design-system'],
  async headers() {
    // 앱 로그인 콜백 안내 페이지는 Route Handler가 더 엄격한 CSP·no-referrer를 직접 붙인다. Next는 설정 헤더가 이미 있으면
    // 같은 이름의 응답 헤더를 버리므로(send-response) 이 경로만 공통 헤더에서 뺀다.
    return [{ source: '/:path((?!app-auth/callback$).*)', headers: securityHeaders }];
  },
  async rewrites() {
    const origin = process.env.GAME_FEEDBACK_API_URL || 'http://127.0.0.1:4300';
    return [
      { source: '/api/:path*', destination: `${origin}/api/:path*` },
      // 표준 경로는 바꿀 수 없어 app/에 점 폴더를 만들지 않고 kebab-case 라우트로 보낸다(앱 로그인 App Link·Universal Link 검증).
    ];
  },
};
export default config;
