import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagesPage } from './MessagesPage';

const failures = vi.hoisted(() => ({ list: false, pane: false }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ session: { user: { id: 'viewer' } } }),
}));
vi.mock('./ChatConnectionStatus', () => ({ ChatConnectionStatus: () => <p>연결 상태 유지</p> }));
vi.mock('./ConversationSidebar', () => ({
  ConversationSidebar: () => {
    if (failures.list) throw new Error('list render failed');
    return <p>정상 대화 목록</p>;
  },
}));
vi.mock('./ConversationPane', () => ({
  ConversationPane: ({ conversationId }: { conversationId: string }) => {
    if (failures.pane) throw new Error('pane render failed');
    return <input aria-label={`대화 ${conversationId} 초안`} defaultValue="" />;
  },
}));

beforeEach(() => {
  failures.list = false;
  failures.pane = false;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('message screen boundaries', () => {
  it('preserves the conversation draft when the list fails', () => {
    const { rerender } = render(<MessagesPage locale="ko" conversationId="first" />);
    fireEvent.change(screen.getByLabelText('대화 first 초안'), {
      target: { value: '아직 보내지 않은 메시지' },
    });
    failures.list = true;
    rerender(<MessagesPage locale="ko" conversationId="first" />);
    expect(screen.getByRole('alert', { name: '대화 목록 오류' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '대화 first 초안' }).value).toBe(
      '아직 보내지 않은 메시지',
    );
    expect(screen.getByText('연결 상태 유지')).toBeTruthy();
  });

  it('keeps the list available and resets the failed pane when another conversation is selected', () => {
    failures.pane = true;
    const { rerender } = render(<MessagesPage locale="ko" conversationId="first" />);
    expect(screen.getByRole('alert', { name: '대화창 오류' })).toBeTruthy();
    expect(screen.getByText('정상 대화 목록')).toBeTruthy();
    failures.pane = false;
    rerender(<MessagesPage locale="ko" conversationId="second" />);
    expect(screen.getByLabelText('대화 second 초안')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
