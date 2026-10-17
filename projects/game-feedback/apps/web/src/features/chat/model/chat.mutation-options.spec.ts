import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { postChatMessage } from '../api/chat.api';
import { chatMessageOptions, conversationListOptions } from './chat.options';
import { sendChatMessageMutationOptions } from './chat.mutation-options';
import type { IChatMessageInput } from './chat.types';

vi.mock('../api/chat.api', () => ({
  postChatMessage: vi.fn(),
  markConversationRead: vi.fn(),
  startConversation: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

describe('chat mutation options', () => {
  it('preserves inferred message variables and refreshes only the affected viewer and room', async () => {
    const client = new QueryClient();
    const aliceInbox = conversationListOptions('alice').queryKey;
    const aliceRoom = chatMessageOptions('alice', 'room-1').queryKey;
    const otherRoom = chatMessageOptions('alice', 'room-2').queryKey;
    const bobInbox = conversationListOptions('bob').queryKey;
    for (const key of [aliceInbox, aliceRoom, otherRoom, bobInbox])
      client.setQueryData(key, { pages: [], pageParams: [] });
    const input: IChatMessageInput = {
      body: 'hello',
      clientMessageId: 'c47d42ae-f943-4df4-b700-217216093fa7',
    };
    vi.mocked(postChatMessage).mockResolvedValue({
      id: 'sent-1',
      conversationId: 'room-1',
      clientMessageId: input.clientMessageId,
      body: input.body,
      createdAt: '2026-10-17T00:00:00.000Z',
      sender: { id: 'alice', nickname: 'Player', isVerified: false, isTestAccount: true, supercellTag: null },
    });
    const options = sendChatMessageMutationOptions(client, 'alice', 'room-1');
    expectTypeOf(options.mutationFn).parameter(0).toEqualTypeOf<IChatMessageInput>();
    await client.getMutationCache().build(client, options).execute(input);
    expect(postChatMessage).toHaveBeenCalledWith('room-1', input);
    expect(client.getQueryState(aliceInbox)?.isInvalidated).toBe(true);
    expect(client.getQueryState(aliceRoom)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherRoom)?.isInvalidated).toBe(false);
    expect(client.getQueryState(bobInbox)?.isInvalidated).toBe(false);
    client.clear();
  });
  it('keeps a failed send as a failure without invalidating the inbox', async () => {
    const client = new QueryClient();
    const inbox = conversationListOptions('alice').queryKey;
    client.setQueryData(inbox, { pages: [], pageParams: [] });
    vi.mocked(postChatMessage).mockRejectedValue(new Error('offline'));
    const mutation = client
      .getMutationCache()
      .build(client, sendChatMessageMutationOptions(client, 'alice', 'room-1'));
    const input = { body: 'retry me', clientMessageId: 'c47d42ae-f943-4df4-b700-217216093fa7' };
    await expect(mutation.execute(input)).rejects.toThrow('offline');
    expect(mutation.state.variables).toEqual(input);
    expect(client.getQueryState(inbox)?.isInvalidated).toBe(false);
    client.clear();
  });
});
