import { QueryClient, skipToken } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { postDetailOptions, postListOptions } from './post.options';

describe('post query cache contracts', () => {
  it('invalidates every feed filter through the shared prefix while preserving detail caches', async () => {
    const client = new QueryClient();
    const latest = postListOptions({ limit: 8, category: 'clash-royale' });
    const unanswered = postListOptions({ limit: 8, unanswered: 'true' });
    const detail = postDetailOptions('request-one');
    client.setQueryData(latest.queryKey, { pages: [{ items: [], nextCursor: null }], pageParams: [''] });
    client.setQueryData(unanswered.queryKey, { pages: [{ items: [], nextCursor: null }], pageParams: [''] });
    client.getQueryCache().build(client, { queryKey: detail.queryKey });
    await client.invalidateQueries(postListOptions());
    expect(client.getQueryState(latest.queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unanswered.queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(detail.queryKey)?.isInvalidated).toBe(false);
    client.clear();
  });
  it('does not request a post before an id is available', () => {
    expect(postDetailOptions().queryFn).toBe(skipToken);
    expect(postListOptions().queryFn).toBe(skipToken);
  });
});
