import createMDX from '@next/mdx';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  experimental: { globalNotFound: true },
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  async redirects() {
    return JSON.parse(readFileSync(new URL('./content/generated-redirects.json', import.meta.url), 'utf8'));
  },
};
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: [
      'rehype-slug',
      [
        'rehype-pretty-code',
        {
          theme: { light: 'github-light', dark: 'github-dark-default' },
          keepBackground: false,
          defaultLang: { block: 'text', inline: 'text' },
        },
      ],
    ],
  },
});
const withIntl = createNextIntlPlugin('./src/i18n/request.ts');
const nextConfig = withIntl(withMDX(config));
export default withSentryConfig(nextConfig, {
  silent: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
