import { fileURLToPath } from 'node:url';

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
  async rewrites() {
    const origin = process.env.GAME_FEEDBACK_API_URL || process.env.API_ORIGIN || 'http://127.0.0.1:4300';
    return [{ source: '/api/:path*', destination: `${origin}/api/:path*` }];
  },
};
export default config;
