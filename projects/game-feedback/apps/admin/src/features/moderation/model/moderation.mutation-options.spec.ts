import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { threadOptions } from '@/features/support';

import { verifyMutationOptions } from './moderation.mutation-options';
import { reportOptions, userOptions } from './moderation.options';

const moderation = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('../api/moderation.api', () => ({ updateVerification: moderation.verify }));

afterEach(() => vi.resetAllMocks());

describe('profile verification', () => {
  it('refreshes the verified user and the support inbox without a callback from the screen', async () => {
    moderation.verify.mockResolvedValue({ id: 'player', isVerified: true });
    const client = new QueryClient();
    const cache = client.getQueryCache();
    cache.build(client, { queryKey: userOptions('player').queryKey });
    cache.build(client, { queryKey: userOptions('someone-else').queryKey });
    cache.build(client, { queryKey: threadOptions().queryKey });
    cache.build(client, { queryKey: reportOptions('OPEN').queryKey });

    await new MutationObserver(client, verifyMutationOptions(client)).mutate({
      id: 'player',
      isVerified: true,
    });

    expect(moderation.verify).toHaveBeenCalledWith({ id: 'player', isVerified: true }, expect.anything());
    expect(client.getQueryState(userOptions('player').queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(threadOptions().queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(userOptions('someone-else').queryKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(reportOptions('OPEN').queryKey)?.isInvalidated).toBe(false);
  });
});
