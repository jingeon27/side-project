import { describe, expect, it } from 'vitest';

import { groupWriteSearchSchema } from './group-write-search.schema';

describe('글쓰기 주소의 대회', () => {
  it('대회 화면이 넘긴 하나의 대회만 미리 고르고 나머지는 일반 글쓰기로 열어야 한다', () => {
    expect(groupWriteSearchSchema.parse({ contestId: ' contest-1 ' })).toEqual({ contestId: 'contest-1' });
    for (const contestId of [undefined, '', '  ', ['contest-1', 'contest-2'], 'c'.repeat(101)])
      expect(groupWriteSearchSchema.parse({ contestId }).contestId).toBeUndefined();
  });
});
