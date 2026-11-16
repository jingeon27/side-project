// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { blogFeedSearchParamsSchema } from './blog-feed-search-params.schema';

describe('blogFeedSearchParamsSchema', () => {
  it('잘못된 카테고리가 있어도 검색어를 보존해야 한다', () => {
    expect(blogFeedSearchParamsSchema.parse({ q: '캐시 #react', category: 'unknown' })).toEqual({
      q: '캐시 #react',
      category: undefined,
    });
  });

  it('잘못된 검색어가 있어도 카테고리를 보존해야 한다', () => {
    expect(blogFeedSearchParamsSchema.parse({ q: ['react', 'cache'], category: 'til' })).toEqual({
      q: undefined,
      category: 'til',
    });
  });

  it('없는 필터는 그대로 두고 입력 중인 공백·대소문자를 바꾸지 않아야 한다', () => {
    expect(blogFeedSearchParamsSchema.parse({})).toEqual({});
    expect(blogFeedSearchParamsSchema.parse({ q: ' ReAcT ', category: 'engineering' })).toEqual({
      q: ' ReAcT ',
      category: 'engineering',
    });
  });
});
