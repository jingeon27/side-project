import type { Article } from '../model/types';

export type ArticleThumbnailImage = {
  src: string;
  fit: 'cover' | 'contain';
};

/** Neutral artwork for an article without a cover image. */
export const defaultArticleThumbnail: ArticleThumbnailImage = {
  src: '/images/thumbnails/default.svg',
  fit: 'cover',
};

export function getArticleThumbnail(article: Pick<Article, 'coverImage'>): ArticleThumbnailImage {
  if (article.coverImage) return { src: article.coverImage, fit: 'cover' };
  return defaultArticleThumbnail;
}
