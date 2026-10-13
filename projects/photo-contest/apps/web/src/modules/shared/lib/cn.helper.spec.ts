import { describe, expect, it } from 'vitest';

import { cn } from './cn.helper';

describe('cn', () => {
  it('커스텀 글자 토큰과 글자색을 함께 남겨야 한다', () => {
    expect(cn('text-title', 'text-ink')).toBe('text-title text-ink');
  });

  it('같은 종류의 클래스가 겹치면 뒤의 값만 남겨야 한다', () => {
    expect(cn('px-4 text-body', 'px-2', 'text-caption')).toBe('px-2 text-caption');
    expect(cn('rounded-card', 'rounded-control')).toBe('rounded-control');
    expect(cn('z-app-bar', 'z-sheet')).toBe('z-sheet');
  });

  it('거짓 값은 무시해야 한다', () => {
    expect(cn('a', false, null, undefined, { b: true, c: false })).toBe('a b');
  });
});
