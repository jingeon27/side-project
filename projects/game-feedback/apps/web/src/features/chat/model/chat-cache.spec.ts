import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Conversation } from '@/shared/api';
import {
  chatMessageOptions,
  chatScopeOptions,
  conversationBadgeOptions,
  conversationListOptions,
  conversationScopeOptions,
} from './chat.options';

function seedInbox(client: QueryClient, userId: string) {
  const inbox = { items: [], nextCursor: null, unreadCount: 2 };
  client.setQueryData(conversationBadgeOptions(userId).queryKey, inbox);
  client.setQueryData(conversationListOptions(userId).queryKey, { pages: [inbox], pageParams: [''] });
}

function seedMessages(client: QueryClient, userId: string, conversationId: string) {
  const conversation: Conversation = {
    id: conversationId,
    peer: { id: 'peer', nickname: '대화 상대', isVerified: false, supercellTag: null, isTestAccount: true },
    lastMessage: null,
    unreadCount: 0,
    updatedAt: '2026-10-17T00:00:00.000Z',
    peerLastReadAt: null,
  };
  client.setQueryData(chatMessageOptions(userId, conversationId).queryKey, {
    pages: [{ conversation, items: [], nextCursor: null }],
    pageParams: [''],
  });
}

describe('chat identity cache boundary', () => {
  it('invalidates one viewer inbox and history without touching another viewer private data', async () => {
    const client = new QueryClient();
    seedInbox(client, 'alice');
    seedInbox(client, 'bob');
    seedMessages(client, 'alice', 'shared-room');
    seedMessages(client, 'bob', 'shared-room');

    await client.invalidateQueries(chatScopeOptions('alice'));

    expect(client.getQueryState(conversationBadgeOptions('alice').queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(conversationListOptions('alice').queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(chatMessageOptions('alice', 'shared-room').queryKey)?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(conversationBadgeOptions('bob').queryKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(conversationListOptions('bob').queryKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(chatMessageOptions('bob', 'shared-room').queryKey)?.isInvalidated).toBe(
      false,
    );
    client.clear();
  });

  it('refreshes unread summaries after a read without refetching message histories or another identity', async () => {
    const client = new QueryClient();
    seedInbox(client, 'alice');
    seedInbox(client, 'bob');
    seedMessages(client, 'alice', 'visible-room');
    seedMessages(client, 'alice', 'other-room');

    await client.invalidateQueries(conversationScopeOptions('alice'));

    expect(client.getQueryState(conversationBadgeOptions('alice').queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(conversationListOptions('alice').queryKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(conversationBadgeOptions('bob').queryKey)?.isInvalidated).toBe(false);
    expect(client.getQueryState(chatMessageOptions('alice', 'visible-room').queryKey)?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(chatMessageOptions('alice', 'other-room').queryKey)?.isInvalidated).toBe(
      false,
    );
    client.clear();
  });
});
