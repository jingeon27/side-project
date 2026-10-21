import { afterEach, expect, it, vi } from 'vitest';

import { expirePostDetailCache } from './post-cache.action';

const { updateTag } = vi.hoisted(() => ({ updateTag: vi.fn() }));
vi.mock('next/cache', () => ({ updateTag }));
afterEach(() => updateTag.mockReset());

it('쓰기 뒤 해당 게시글의 공개 상세 캐시를 만료해야 한다', async () => {
  await expirePostDetailCache('post-1');
  expect(updateTag).toHaveBeenCalledExactlyOnceWith('post:post-1');
});

it('누구나 부를 수 있는 액션이므로 형식이 잘못된 id로는 태그를 만들지 않아야 한다', async () => {
  await expirePostDetailCache('post:*');
  expect(updateTag).not.toHaveBeenCalled();
});
