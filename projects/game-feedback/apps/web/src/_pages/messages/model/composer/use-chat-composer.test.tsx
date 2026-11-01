import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendChatMessageMutationOptions } from '@/features/chat';

import { useChatComposer } from './use-chat-composer';

const api = vi.hoisted(() => ({
  upload: vi.fn(),
  send: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/features/chat/api/chat.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  uploadAttachment: api.upload,
  postChatMessage: api.send,
  removeAttachment: api.remove,
}));

const attachment = {
  id: 'attachment-1',
  name: 'clip.png',
  mimeType: 'image/png',
  size: 3,
  kind: 'IMAGE',
  url: '/api/conversations/conversation-1/attachments/attachment-1',
};

function renderComposer() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const rendered = renderHook(
    () =>
      useChatComposer({
        userId: 'viewer',
        conversationId: 'conversation-1',
        unavailable: false,
        onSent: () => undefined,
        onUnavailable: async () => undefined,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...rendered, client };
}

async function attach(result: ReturnType<typeof renderComposer>['result']) {
  await act(() => result.current.handleFile(new File(['png'], 'clip.png', { type: 'image/png' })));
  await waitFor(() => expect(result.current.upload.data?.id).toBe(attachment.id));
}

beforeEach(() => {
  api.upload.mockReset().mockResolvedValue(attachment);
  api.send.mockReset().mockResolvedValue({ id: 'message-1' });
  api.remove.mockReset().mockResolvedValue({ ok: true });
});

describe('unsent chat attachment cleanup', () => {
  // 첨부 cleanup이 upload.data에 묶여 전송·제거 뒤 reset만으로 이미 보냈거나 지운 첨부에 DELETE(404)를 또 보냈다.
  it('does not delete an attachment that was sent with the message', async () => {
    const { result, unmount } = renderComposer();
    await attach(result);
    await act(() => result.current.handleSubmit());
    await waitFor(() => expect(result.current.upload.data).toBeUndefined());
    expect(api.send).toHaveBeenCalledOnce();
    unmount();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('deletes a removed attachment only once', async () => {
    const { result, unmount } = renderComposer();
    await attach(result);
    await act(() => result.current.handleRemoveFile());
    await waitFor(() => expect(result.current.upload.data).toBeUndefined());
    unmount();
    expect(api.remove).toHaveBeenCalledOnce();
    expect(api.remove).toHaveBeenCalledWith('conversation-1', attachment.id);
  });

  it('discards the pending attachment when the user leaves the conversation without sending', async () => {
    const { result, unmount } = renderComposer();
    await attach(result);
    expect(api.remove).not.toHaveBeenCalled();
    unmount();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('conversation-1', attachment.id);
  });

  it('keeps an in-flight message attachment when the user leaves and the send succeeds', async () => {
    const pending = Promise.withResolvers<{ id: string }>();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, unmount, client } = renderComposer();
    await attach(result);
    act(() => {
      void result.current.handleSubmit();
    });
    await waitFor(() => expect(api.send).toHaveBeenCalledOnce());
    unmount();
    expect(api.remove).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ id: 'sent-message' }));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('discards an in-flight attachment only after the send fails after leaving', async () => {
    const pending = Promise.withResolvers<{ id: string }>();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, unmount, client } = renderComposer();
    await attach(result);
    act(() => {
      void result.current.handleSubmit();
    });
    await waitFor(() => expect(api.send).toHaveBeenCalledOnce());
    unmount();
    expect(api.remove).not.toHaveBeenCalled();

    await act(async () => pending.reject(new Error('Send failed')));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('conversation-1', attachment.id);
  });

  it('does not let a previous send in the same conversation own a newly uploaded attachment', async () => {
    const pending = Promise.withResolvers<{ id: string }>();
    api.send.mockReturnValueOnce(pending.promise);
    const { result, unmount, client } = renderComposer();
    const previous = client
      .getMutationCache()
      .build(client, sendChatMessageMutationOptions(client, 'viewer', 'conversation-1'));
    const sending = previous.execute({
      body: '이전 메시지',
      clientMessageId: crypto.randomUUID(),
      attachmentIds: ['previous-attachment'],
    });
    await waitFor(() => expect(api.send).toHaveBeenCalledOnce());
    await attach(result);
    unmount();
    expect(api.remove).toHaveBeenCalledExactlyOnceWith('conversation-1', attachment.id);
    pending.resolve({ id: 'previous-message' });
    await sending;
    expect(api.remove).toHaveBeenCalledOnce();
  });

  it('preserves the mounted failed draft and reuses its message ID on retry', async () => {
    api.send.mockRejectedValueOnce(new Error('Connection interrupted'));
    const { result } = renderComposer();
    await attach(result);
    act(() => result.current.form.setValue('body', '실패한 초안'));
    await act(() => result.current.handleSubmit());
    expect(result.current.draft).toBe('실패한 초안');
    expect(result.current.upload.data?.id).toBe(attachment.id);
    expect(api.remove).not.toHaveBeenCalled();
    await act(() => result.current.handleSubmit());
    expect(api.send).toHaveBeenCalledTimes(2);
    expect(api.send.mock.calls[0]?.[1]).toEqual(api.send.mock.calls[1]?.[1]);
  });
});
