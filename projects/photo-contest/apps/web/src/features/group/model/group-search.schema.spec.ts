import { describe, expect, it } from 'vitest';

import { groupSearchSchema } from './group-search.schema';

describe('그룹 검색 입력 경계', () => {
  it('폼은 길이 오류를 사용자에게 알리고 유효한 값만 제출해야 한다', () => {
    expect(groupSearchSchema.safeParse({ q: '가'.repeat(41) }).success).toBe(false);
    expect(groupSearchSchema.parse({ q: ' 웃음 ' }).q).toBe('웃음');
  });
});
