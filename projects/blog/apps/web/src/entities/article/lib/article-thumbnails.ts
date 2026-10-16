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
  'health-check-program': { src: '/images/posts/health-check-program/04.png', fit: 'contain' },
  'low-effort-success': { src: '/images/thumbnails/low-effort-success.svg', fit: 'cover' },
  'nextjs-seo-prefetch': { src: '/images/thumbnails/nextjs-seo-prefetch.svg', fit: 'cover' },
  'nextjs-server-client-issues': { src: '/images/posts/nextjs-server-client-issues/01.jpg', fit: 'cover' },
  'nextjs-tanstack-query-ssr': { src: '/images/thumbnails/nextjs-tanstack-query-ssr.svg', fit: 'cover' },
  'payment-coupon-branches': { src: '/images/posts/payment-coupon-branches/01.png', fit: 'contain' },
  'plan-gated-ai-workflow': { src: '/images/posts/plan-gated-ai-workflow/01.jpg', fit: 'cover' },
  'prototype-working-rules': { src: '/images/thumbnails/prototype-working-rules.svg', fit: 'cover' },
  'puppeteer-event-lifecycle': { src: '/images/thumbnails/puppeteer-event-lifecycle.svg', fit: 'cover' },
  'query-key-factory': { src: '/images/thumbnails/query-key-factory.svg', fit: 'cover' },
  'reading-ai-code': { src: '/images/posts/reading-ai-code/01.png', fit: 'cover' },
  'reservation-form-state': { src: '/images/posts/reservation-form-state/04.png', fit: 'contain' },
  'review-form-funnel': { src: '/images/posts/review-form-funnel/01.png', fit: 'contain' },
  'review-like-optimistic-update': {
    src: '/images/thumbnails/review-like-optimistic-update.svg',
    fit: 'cover',
  },
  'sentry-observability': { src: '/images/posts/sentry-observability/01.jpg', fit: 'cover' },
  'sitemap-api-boundaries': { src: '/images/thumbnails/sitemap-api-boundaries.svg', fit: 'cover' },
  'testing-standards': { src: '/images/posts/testing-standards/01.jpg', fit: 'cover' },
  'typed-program-form': { src: '/images/posts/typed-program-form/02.png', fit: 'contain' },
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
