import { QueryClient, skipToken } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { notificationListOptions, notificationSummaryOptions } from './notification.options';

describe('notification identity and cache scope', () => {
  it('updates one user inbox and badge together without invalidating a different user', async () => {
    const client = new QueryClient();
    const inbox = notificationListOptions('requester', { limit: 20 });
    const badge = notificationSummaryOptions('requester');
    const otherBadge = notificationSummaryOptions('coach');
    const response = { items: [], nextCursor: null, unreadCount: 0 };
    client.setQueryData(inbox.queryKey, { pages: [response], pageParams: [''] });
    client.setQueryData(badge.queryKey, response);
    client.setQueryData(otherBadge.queryKey, response);
    await client.invalidateQueries(notificationListOptions('requester'));
    expect(client.getQueryState(inbox.queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(badge.queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherBadge.queryKey)?.isInvalidated).toBe(false);
    client.clear();
  });
  it('keeps authenticated requests disabled before a session is available', () => {
    expect(notificationSummaryOptions().queryFn).toBe(skipToken);
    expect(notificationListOptions(undefined, { limit: 20 }).queryFn).toBe(skipToken);
  });
});
