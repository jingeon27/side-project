import { expect, it, vi } from 'vitest';
import { refreshServerPostDetail } from './post-detail-cache';

const { expirePostDetailCache } = vi.hoisted(() => ({ expirePostDetailCache: vi.fn() }));
vi.mock('../api/post-cache.action', () => ({ expirePostDetailCache }));

it('서버 캐시 만료가 실패해도 쓰기 성공 처리를 실패로 바꾸지 않아야 한다', async () => {
  expirePostDetailCache.mockRejectedValueOnce(new Error('network down'));
  await expect(refreshServerPostDetail('post-1')).resolves.toBeUndefined();
  expect(expirePostDetailCache).toHaveBeenCalledExactlyOnceWith('post-1');
});
