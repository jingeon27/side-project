import { describe, expect, it } from 'vitest';

import { groupCategorySchema, moveGroupCategory } from './group-category.schema';

describe('카테고리 입력과 순서', () => {
  it('공백을 제거하고 이름을 1~20자로 제한해야 한다', () => {
    expect(groupCategorySchema.parse({ name: ' 합성 ' })).toEqual({ name: '합성' });
    for (const name of ['', '  ', '글'.repeat(21)])
      expect(groupCategorySchema.safeParse({ name }).success).toBe(false);
  });
  it('선택한 카테고리만 한 칸 옮기고 원본 순서를 유지해야 한다', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveGroupCategory(ids, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveGroupCategory(ids, 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
  it('맨 앞·맨 뒤·없는 ID를 밖으로 옮기지 않아야 한다', () => {
    for (const [id, direction] of [
      ['a', -1],
      ['c', 1],
      ['missing', 1],
    ] as const)
      expect(moveGroupCategory(['a', 'b', 'c'], id, direction)).toEqual(['a', 'b', 'c']);
  });
});
