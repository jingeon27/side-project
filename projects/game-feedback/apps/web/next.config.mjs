import { fileURLToPath } from 'node:url';

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

/** @type {import('next').NextConfig} */
const config = {
  output: process.env.GF_STANDALONE === 'true' ? 'standalone' : undefined,
  outputFileTracingRoot: fileURLToPath(new URL('../../../../', import.meta.url)),
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Preserve Flight headers so public documents and client navigation can use their own boundaries.
  skipProxyUrlNormalize: true,
  experimental: { exposeTestingApiInProductionBuild: process.env.GF_PREFETCH_TESTING === 'true' },
  env: {
    NEXT_PUBLIC_GAME_FEEDBACK_CONTACT_EMAIL: process.env.GAME_FEEDBACK_CONTACT_EMAIL ?? '',
  },
  transpilePackages: ['@game-feedback/contracts', '@game-feedback/sdk', '@side/design-system'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    const origin = process.env.GAME_FEEDBACK_API_URL || process.env.API_ORIGIN || 'http://127.0.0.1:4300';
    return [
      { source: '/api/:path*', destination: `${origin}/api/:path*` },
      // 표준 경로는 바꿀 수 없어 app/에 점 폴더를 만들지 않고 kebab-case 라우트로 보낸다(앱 로그인 App Link·Universal Link 검증).
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/app-links/apple-app-site-association',
      },
      { source: '/.well-known/assetlinks.json', destination: '/app-links/assetlinks' },
    ];
  },
};
export default config;
