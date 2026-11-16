import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupportThreadSchema } from '@game-feedback/contracts';

import { threadListOptions, threadOptions } from './support.options';

const api = vi.hoisted(() => ({ threads: vi.fn(), thread: vi.fn() }));
vi.mock('../api/support.api', () => ({
  fetchThreads: api.threads,
  fetchThread: api.thread,
  fetchMessages: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

const thread = SupportThreadSchema.parse({
  id: 'support-1',
  conversationId: 'conversation-1',
  requester: {
    id: 'user-1',
    nickname: '문의자',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
  },
  adminId: 'admin-1',
  topic: 'GENERAL',
  status: 'OPEN',
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
});

describe('admin support queries', () => {
  it('pages the inbox by cursor and sends the status only when filtering', async () => {
    api.threads
      .mockResolvedValueOnce({ items: [thread], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const client = new QueryClient();
    const observer = new InfiniteQueryObserver(client, threadListOptions('CLOSED'));
    await observer.refetch();
    await observer.fetchNextPage();
    expect(api.threads.mock.calls).toEqual([
      [{ status: 'CLOSED', cursor: '' }],
      [{ status: 'CLOSED', cursor: 'cursor-2' }],
    ]);
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    api.threads.mockResolvedValueOnce({ items: [], nextCursor: null });
    await client.fetchInfiniteQuery(threadListOptions('ALL'));
    expect(api.threads.mock.calls.at(-1)).toEqual([{ cursor: '' }]);
  });

  it('keeps lists and deep-linked threads under one prefix so a status change refreshes both', async () => {
    api.thread.mockResolvedValue(thread);
    const client = new QueryClient();
    await client.fetchQuery(threadOptions('support-1'));
    expect(api.thread).toHaveBeenCalledWith('support-1');
    const prefix = threadOptions().queryKey;
    for (const key of [threadOptions('support-1').queryKey, threadListOptions('OPEN').queryKey])
      expect(key.slice(0, prefix.length)).toEqual(prefix);
    await client.invalidateQueries(threadOptions());
    expect(client.getQueryState(threadOptions('support-1').queryKey)?.isInvalidated).toBe(true);
  });
});
