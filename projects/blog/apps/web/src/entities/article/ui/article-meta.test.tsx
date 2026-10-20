import { describe, expect, it } from 'vitest';

import { render } from '@testing-library/react';

import { ArticleMeta } from './article-meta';

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
  it.each([
    ['ko', '2026년 10월 1일', '2026년 10월 17일'],
    ['en', 'Oct 1, 2026', 'Oct 17, 2026'],
  ] as const)(
    'keeps Korean publication and revision dates after midnight in %s',
    (locale, published, updated) => {
      const entry = {
        ...article,
        locale,
        publishedAt: '2026-10-01T00:10:00+09:00',
        updatedAt: '2026-10-17T01:15:00+09:00',
      };
      const { container } = render(<ArticleMeta article={entry} showUpdated />);
      const dates = container.querySelectorAll('time');
      expect(dates).toHaveLength(2);
      expect(dates[0]).toHaveTextContent(published);
      expect(dates[0]).toHaveAttribute('datetime', entry.publishedAt);
      expect(dates[1]).toHaveTextContent(updated);
      expect(dates[1]).toHaveAttribute('datetime', entry.updatedAt);
    },
  );
});
