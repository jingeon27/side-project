import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { notificationListOptions } from '@/features/notification';

import { deletePostMutationOptions } from './post.mutation-options';
import { postDetailOptions, postListOptions } from './post.options';

const { deletePostById, fetchPostDetail } = vi.hoisted(() => ({
  deletePostById: vi.fn(),
  fetchPostDetail: vi.fn(),
}));
vi.mock('../api/post.api', () => ({
  deletePostById,
  fetchPostDetail,
  fetchPostList: vi.fn(),
  patchPost: vi.fn(),
  postPost: vi.fn(),
  postPostRead: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

describe('게시글 삭제 캐시', () => {
  it('열려 있는 상세를 다시 받지 않고 캐시에서 빼서 삭제 직후 404 오류가 보이지 않아야 한다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const detail = postDetailOptions('deleted-post');
    // 응답 모양은 이 사례에서 쓰지 않는다. 재조회 여부만 본다.
    fetchPostDetail.mockResolvedValueOnce({ post: { id: 'deleted-post' } });
    const observer = new QueryObserver(client, { ...detail, refetchOnMount: 'always' });
    const stop = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    const feed = postListOptions({ board: 'ALL', limit: 12 }).queryKey;
    client.setQueryData(feed, { pages: [], pageParams: [''] });
    const notifications = notificationListOptions('viewer', { limit: 20 }).queryKey;
    client.setQueryData(notifications, { pages: [], pageParams: [''] });
    deletePostById.mockResolvedValue({ ok: true });

    await client
      .getMutationCache()
      .build(client, deletePostMutationOptions(client))
      .execute({ id: 'deleted-post' });

    expect(fetchPostDetail).toHaveBeenCalledOnce();
    expect(client.getQueryCache().find({ queryKey: detail.queryKey })).toBeUndefined();
    expect(observer.getCurrentResult().isError).toBe(false);
    expect(client.getQueryState(feed)?.isInvalidated).toBe(true);
    expect(client.getQueryState(notifications)?.isInvalidated).toBe(true);
    stop();
    client.clear();
  });
});
