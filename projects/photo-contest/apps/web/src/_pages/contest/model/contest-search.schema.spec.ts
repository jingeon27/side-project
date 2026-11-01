import { describe, expect, it } from 'vitest';

import { contestSearchSchema } from './contest-search.schema';

describe('대회 정렬 주소', () => {
  it('지원하는 정렬만 받고 없거나 잘못된 값은 최신순으로 보여줘야 한다', () => {
    expect(contestSearchSchema.parse({ sort: 'popular' }).sort).toBe('popular');
    for (const sort of [undefined, 'invalid', ['popular', 'latest']])
      expect(contestSearchSchema.parse({ sort }).sort).toBe('latest');
  });
});
