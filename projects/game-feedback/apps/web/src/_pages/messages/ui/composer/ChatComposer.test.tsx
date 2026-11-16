import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';
import { LanguageProvider, type TLocale } from '@/shared/i18n';

import { ChatComposer } from './ChatComposer';

const api = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/features/chat/api/chat.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postChatMessage: api.send,
}));

function renderComposer(locale: TLocale = 'ko') {
  const onSent = vi.fn();
  render(
    <LanguageProvider initialLocale={locale} initialPreference={locale} automaticLocale={locale}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <ChatComposer
          userId="viewer"
          conversationId="conversation-1"
          unavailable={false}
          readFailed={false}
          onRetryRead={() => undefined}
          onSent={onSent}
          onUnavailable={async () => undefined}
        />
      </QueryClientProvider>
    </LanguageProvider>,
  );
  return onSent;
}

function send(input: HTMLTextAreaElement, body: string) {
  fireEvent.change(input, { target: { value: body } });
  input.focus();
  const form = input.closest('form');
  if (!form) throw new Error('Expected the message form.');
  fireEvent.submit(form);
}

beforeEach(() => {
  api.send.mockReset();
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

// 전송 중 입력창을 disabled로 바꿔 포커스가 빠졌다. 보낼 때마다 입력창을 다시 눌러야 했고 모바일 키보드가 내려갔다.
// jsdom은 disabled로 바뀐 컨트롤의 포커스를 옮기지 않으므로 readOnly·disabled 단언이 회귀를 잡는다.
it('keeps the message input focused while sending and after the message is sent', async () => {
  const sent = Promise.withResolvers<{ id: string }>();
  api.send.mockReturnValueOnce(sent.promise);
  const onSent = renderComposer();
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '메시지 내용' });
  send(input, '다음 판도 같이 해요');
  await waitFor(() => expect(api.send).toHaveBeenCalledOnce());
  expect(input.readOnly).toBe(true);
  expect(input.disabled).toBe(false);
  expect(document.activeElement).toBe(input);
  await act(async () => sent.resolve({ id: 'message-1' }));
  await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
  expect(input.value).toBe('');
  expect(input.readOnly).toBe(false);
  expect(document.activeElement).toBe(input);
});

// 모바일은 전송 버튼으로만 보내는데, 버튼을 누르면 포커스가 입력창을 떠나 보낼 때마다 키보드가 내려갔다.
it('keeps the message input focused when the send button is pressed', async () => {
  api.send.mockResolvedValueOnce({ id: 'message-1' });
  const user = userEvent.setup();
  const onSent = renderComposer();
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '메시지 내용' });
  await user.type(input, '버튼으로 보낼게요');
  await user.click(screen.getByRole('button', { name: '보내기' }));
  await waitFor(() => expect(onSent).toHaveBeenCalledOnce());
  expect(api.send).toHaveBeenCalledOnce();
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
});

// 전송 실패 안내만 t()를 거치지 않아 영어·일본어 화면에서도 한국어로 보였다.
it('shows the send failure in the selected language and keeps the draft', async () => {
  api.send.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'Too Many Requests'));
  renderComposer('en');
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
  send(input, 'Rematch?');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain("You're sending messages too quickly. Please try again in a moment.");
  expect(alert.textContent).toContain('Your draft has been kept.');
  expect(input.value).toBe('Rematch?');
});
