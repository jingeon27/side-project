import { describe, expect, it } from 'vitest';

import { matchesArticleSearch } from '@/features/article-search/lib/matches-article-search';

describe('unified article search', () => {
  it('matches title or tag substrings without requiring both to match', () => {
    expect(matchesArticleSearch({ title: '상태 복구', tags: ['react-hook-form'] }, 'REACT', 'ko')).toBe(true);
    expect(matchesArticleSearch({ title: 'React 상태 복구', tags: ['testing'] }, 'react', 'ko')).toBe(true);
    expect(matchesArticleSearch({ title: '상태 복구', tags: ['testing'] }, 'react', 'ko')).toBe(false);
  });

  it('treats #tag as an exact tag query rather than a title or tag substring', () => {
    expect(matchesArticleSearch({ title: '상태 복구', tags: ['react'] }, '#REACT', 'ko')).toBe(true);
    expect(matchesArticleSearch({ title: '상태 복구', tags: ['react-hook-form'] }, '#react', 'ko')).toBe(
      false,
    );
    expect(matchesArticleSearch({ title: 'React 상태 복구', tags: ['testing'] }, '#react', 'ko')).toBe(false);
  });

  it('normalizes pasted spacing and compatibility characters before matching', () => {
    expect(matchesArticleSearch({ title: '상태 복구', tags: ['react'] }, '  ＲＥＡＣＴ  ', 'ko')).toBe(true);
    expect(matchesArticleSearch({ title: '상태 복구', tags: ['react'] }, '  ＃ＲＥＡＣＴ  ', 'ko')).toBe(
      true,
    );
    expect(matchesArticleSearch({ title: '상태 복구', tags: [] }, '   ', 'ko')).toBe(true);
  });
});
