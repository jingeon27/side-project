import { describe, expect, it } from 'vitest';

import { exploreSearchSchema } from './explore-search.schema';

describe('탐색 URL 검색어', () => {
  it('검색어를 정규화하고 배열·누락은 이 필드만 기본값으로 되돌려야 한다', () => {
    expect(exploreSearchSchema.parse({ q: ' 웃음 ' })).toEqual({ q: '웃음' });
    for (const q of [undefined, ['a', 'b'], 123]) expect(exploreSearchSchema.parse({ q }).q).toBe('');
    expect(exploreSearchSchema.parse({ q: '가'.repeat(50) }).q).toBe('가'.repeat(40));
  });
});
