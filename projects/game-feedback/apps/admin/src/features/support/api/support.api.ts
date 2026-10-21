import { listChatMessages, listSupportThreads, sendChatMessage, setSupportStatus } from '@game-feedback/sdk';

export const fetchThreads = () => listSupportThreads();
export const fetchMessages = (id: string, cursor: string) =>
  listChatMessages(id, { limit: 30, ...(cursor ? { cursor } : {}) });
export const updateStatus = ({ id, status }: { id: string; status: 'OPEN' | 'CLOSED' }) =>
  setSupportStatus(id, { status });
export const sendReply = ({
  conversationId,
  body,
  clientMessageId,
}: {
  conversationId: string;
  body: string;
  clientMessageId: string;
}) => sendChatMessage(conversationId, { body, clientMessageId });
export type TSupportThread = Awaited<ReturnType<typeof fetchThreads>>[number];
