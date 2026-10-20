import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import { ArticleCard } from './article-card';

import type { Article } from '@/entities/article/model/types';

const article: Article = {
  id: 'cache',
  locale: 'ko',
  title: '캐시 설계',
  slug: '캐시-설계',
  description: '서버와 클라이언트 캐시를 분리한 과정',
  keywords: ['cache'],
  category: 'engineering',
  tags: ['nextjs'],
  publishedAt: '2026-10-01',
  readingMinutes: 4,
  toc: [],
  translations: { ko: '캐시-설계' },
};

describe('article discovery', () => {
  it('shows linked article metadata, category, and tags', () => {
    render(<ArticleCard article={article} />);
    expect(screen.getByRole('link', { name: article.title })).toHaveAttribute('href', '/ko/blog/캐시-설계');
    expect(screen.getByRole('link', { name: '개발 경험' })).toHaveAttribute(
      'href',
      '/ko/blog/category/engineering',
    );
    expect(screen.getByRole('link', { name: '#nextjs' })).toHaveAttribute('href', '/ko/blog/tag/nextjs');
    expect(screen.getByText(article.description)).toBeVisible();
  });
});
