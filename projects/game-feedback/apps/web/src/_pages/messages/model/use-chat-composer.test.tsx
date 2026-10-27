import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  return renderHook(
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
});
