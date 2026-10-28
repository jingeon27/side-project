import type { TSupportStatus } from '@game-feedback/contracts';
import {
  getSupportThread,
  listAdminSupportMessages,
  listSupportThreads,
  sendAdminSupportMessage,
  setSupportStatus,
} from '@game-feedback/sdk';

/** 문의함 한 페이지. 상태를 비우면 모든 문의를 받는다. */
export const fetchThreads = ({ status, cursor }: { status?: TSupportStatus; cursor: string }) =>
  listSupportThreads({ limit: 20, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) });
/** 목록 페이지에 없어도 주소의 문의 하나를 연다. */
export const fetchThread = (id: string) => getSupportThread(id);
export const fetchMessages = (id: string, cursor: string) =>
  listAdminSupportMessages(id, { limit: 30, ...(cursor ? { cursor } : {}) });
export const updateStatus = ({ id, status }: { id: string; status: TSupportStatus }) =>
  setSupportStatus(id, { status });
export const sendReply = ({
  conversationId,
  body,
  clientMessageId,
}: {
  conversationId: string;
  body: string;
  clientMessageId: string;
}) => sendAdminSupportMessage(conversationId, { body, clientMessageId });
export type TSupportThread = Awaited<ReturnType<typeof fetchThread>>;
