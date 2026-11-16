import { describe, expect, it } from 'vitest';

import { toGroupVisibility } from './group-visibility';

describe('그룹 공개 범위', () => {
  it('명시한 PUBLIC만 공개로 판정해야 한다', () => {
    expect(toGroupVisibility('PUBLIC')).toBe('PUBLIC');
  });

  it('비공개·알 수 없는 값은 공개하지 않아야 한다', () => {
    for (const value of ['PRIVATE', '', 'public', 'UNKNOWN'])
      expect(toGroupVisibility(value)).toBe('PRIVATE');
  });
});
