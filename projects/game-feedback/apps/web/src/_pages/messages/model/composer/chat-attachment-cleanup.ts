import type { MutationKey, QueryClient } from '@tanstack/react-query';

import { discardChatAttachment } from '@/features/chat';

/** 전송 수명은 화면보다 길 수 있으므로 진행 중인 mutation이 첨부 소유권을 먼저 확정한다. */
export function cleanupChatAttachment(
  client: QueryClient,
  mutationKey: MutationKey,
  conversationId: string,
  attachmentId: string,
) {
  const discard = () => {
    void discardChatAttachment(conversationId, attachmentId).catch(() => {});
  };
  const cache = client.getMutationCache();
  const pending = cache.findAll({ mutationKey, exact: true, status: 'pending' }).filter((mutation) => {
    const variables: unknown = mutation.state.variables;
    return (
      typeof variables === 'object' &&
      variables !== null &&
      'attachmentIds' in variables &&
      Array.isArray(variables.attachmentIds) &&
      variables.attachmentIds.includes(attachmentId)
    );
  });
  if (!pending.length) {
    discard();
    return;
  }
  const handleSettled = () => {
    if (pending.some((mutation) => mutation.state.status === 'pending')) return;
    unsubscribe();
    if (!pending.some((mutation) => mutation.state.status === 'success')) discard();
  };
  const unsubscribe = cache.subscribe(handleSettled);
  handleSettled();
}
