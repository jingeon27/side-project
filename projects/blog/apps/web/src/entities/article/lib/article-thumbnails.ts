import type { Article } from '../model/types';

export type ArticleThumbnailImage = {
  src: string;
  fit: 'cover' | 'contain';
};

export const articleThumbnails = {
  'bottom-sheet-drag-crash': { src: '/images/thumbnails/bottom-sheet-drag-crash.svg', fit: 'cover' },
  'chatbot-message-layer': { src: '/images/thumbnails/chatbot-message-layer.svg', fit: 'cover' },
  'cross-domain-token-handoff': { src: '/images/thumbnails/cross-domain-token-handoff.svg', fit: 'cover' },
  'declarative-code': { src: '/images/thumbnails/declarative-code.svg', fit: 'cover' },
  'electron-module-boundaries': { src: '/images/thumbnails/electron-module-boundaries.svg', fit: 'cover' },
  'error-boundary-recovery': { src: '/images/thumbnails/error-boundary-recovery.svg', fit: 'cover' },
  'fsd-layer-boundaries': { src: '/images/thumbnails/fsd-layer-boundaries.svg', fit: 'cover' },
  'health-check-program': { src: '/images/thumbnails/health-check-program.svg', fit: 'cover' },
  'low-effort-success': { src: '/images/thumbnails/low-effort-success.svg', fit: 'cover' },
  'nextjs-seo-prefetch': { src: '/images/thumbnails/nextjs-seo-prefetch.svg', fit: 'cover' },
  'nextjs-server-client-issues': { src: '/images/thumbnails/nextjs-server-client-issues.svg', fit: 'cover' },
  'nextjs-tanstack-query-ssr': { src: '/images/thumbnails/nextjs-tanstack-query-ssr.svg', fit: 'cover' },
  'payment-coupon-branches': { src: '/images/thumbnails/payment-coupon-branches.svg', fit: 'cover' },
  'plan-gated-ai-workflow': { src: '/images/thumbnails/plan-gated-ai-workflow.svg', fit: 'cover' },
  'prototype-working-rules': { src: '/images/thumbnails/prototype-working-rules.svg', fit: 'cover' },
  'puppeteer-event-lifecycle': { src: '/images/thumbnails/puppeteer-event-lifecycle.svg', fit: 'cover' },
  'query-key-factory': { src: '/images/thumbnails/query-key-factory.svg', fit: 'cover' },
  'reading-ai-code': { src: '/images/thumbnails/reading-ai-code.svg', fit: 'cover' },
  'reservation-form-state': { src: '/images/thumbnails/reservation-form-state.svg', fit: 'cover' },
  'review-form-funnel': { src: '/images/thumbnails/review-form-funnel.svg', fit: 'cover' },
  'review-like-optimistic-update': {
    src: '/images/thumbnails/review-like-optimistic-update.svg',
    fit: 'cover',
  },
  'sentry-observability': { src: '/images/thumbnails/sentry-observability.svg', fit: 'cover' },
  'side-project-design': { src: '/images/thumbnails/side-project-design.svg', fit: 'cover' },
  'sitemap-api-boundaries': { src: '/images/thumbnails/sitemap-api-boundaries.svg', fit: 'cover' },
  'testing-standards': { src: '/images/thumbnails/testing-standards.svg', fit: 'cover' },
  'typed-program-form': { src: '/images/thumbnails/typed-program-form.svg', fit: 'cover' },
  'typescript-patterns': { src: '/images/thumbnails/typescript-patterns.svg', fit: 'cover' },
  'zod-assertion-boundaries': { src: '/images/thumbnails/zod-assertion-boundaries.svg', fit: 'cover' },
} satisfies Record<string, ArticleThumbnailImage>;

export function getArticleThumbnail(article: Pick<Article, 'id' | 'coverImage'>): ArticleThumbnailImage {
  if (article.coverImage) return { src: article.coverImage, fit: 'cover' };
  if (Object.hasOwn(articleThumbnails, article.id)) {
    return articleThumbnails[article.id as keyof typeof articleThumbnails];
  }
  return articleThumbnails['nextjs-tanstack-query-ssr'];
}
