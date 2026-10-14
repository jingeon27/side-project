import { describe, expect, it, vi } from 'vitest';

import { siblingLoader } from './batch';

describe('형제 노드 일괄 조회', () => {
  it('처음 요청될 때 형제 키 전체를 한 번만 불러와야 한다', async () => {
    const load = vi.fn(
      async (keys: readonly string[]) => new Map(keys.map((key) => [key, key.toUpperCase()])),
    );
    const loadSibling = siblingLoader(['a', 'b', 'c'], load, '');
    expect(load).not.toHaveBeenCalled();
    expect(await Promise.all([loadSibling('a'), loadSibling('c'), loadSibling('b')])).toEqual([
      'A',
      'C',
      'B',
    ]);
    expect(await loadSibling('a')).toBe('A');
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('결과에 없는 키는 기본값을 돌려줘야 한다', async () => {
    const loadSibling = siblingLoader(['a'], async () => new Map<string, number>(), 0);
    expect(await loadSibling('a')).toBe(0);
  });
});
