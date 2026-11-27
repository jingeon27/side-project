import { resolve } from 'node:path';

import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['sqlite-vec'],
  transpilePackages: ['@side/design-system'],
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  ...(process.env.DEOKDAM_STANDALONE === '1' && {
    output: 'standalone',
    outputFileTracingRoot: resolve(import.meta.dirname, '../../../..'),
    outputFileTracingIncludes: { '/api/readings': ['../../../../node_modules/sqlite-vec*/**/*'] },
  }),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
