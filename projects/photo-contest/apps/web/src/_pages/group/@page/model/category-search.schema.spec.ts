import { describe,expect,it } from 'vitest';
import { parseGroupCategory } from './category-search.schema';
describe('그룹 카테고리 URL', () => {
  it('현재 그룹의 활성 카테고리만 선택해야 한다', () =>
    expect(parseGroupCategory('cat', [{ id: 'cat' }])).toBe('cat'));
  it.each([null, undefined, [], ['cat'], 'other', 'x'.repeat(101)])(
    '없는 값·다른 그룹·잘못된 값 %j는 전체로 보여 줘야 한다',
    (value) => expect(parseGroupCategory(value, [{ id: 'cat' }])).toBeNull(),
  );
});
