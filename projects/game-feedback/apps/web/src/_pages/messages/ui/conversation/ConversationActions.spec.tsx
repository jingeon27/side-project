import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Author } from '@/shared/api';

import { ConversationActions } from './ConversationActions';

const actions = vi.hoisted(() => ({ overlay: vi.fn(), block: vi.fn(), report: vi.fn() }));
vi.mock('@/shared/ui', () => ({ openOverlay: actions.overlay }));
vi.mock('@/widgets/moderation', () => ({ openUserReport: actions.report }));
vi.mock('../../model/conversation/use-chat-block', () => ({
  useChatBlock: () => ({ handleBlock: actions.block }),
}));

const peer = {
  id: 'peer',
  nickname: '덱연구소',
  avatarUrl: null,
  isVerified: false,
  supercellTag: null,
  isTestAccount: false,
} satisfies Author;

function renderActions(throughMessageId?: string) {
  return render(
    <ConversationActions
      userId="viewer"
      conversationId="room"
      locale="ko"
      peer={peer}
      throughMessageId={throughMessageId}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('conversation actions menu', () => {
  it('keeps clearing unavailable while the conversation has no last message', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: '대화 메뉴' }));
    const clear = await screen.findByRole('menuitem', { name: '대화내역 삭제' });
    expect(clear.getAttribute('aria-disabled')).toBe('true');
    await user.click(clear);

    expect(actions.overlay).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('opens the clear confirmation once when the last message exists', async () => {
    const user = userEvent.setup();
    renderActions('message-9');

    await user.click(screen.getByRole('button', { name: '대화 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '대화내역 삭제' }));

    expect(actions.overlay).toHaveBeenCalledOnce();
    expect(actions.overlay.mock.calls[0]?.[1]).toEqual({ overlayId: 'clear-chat:viewer:room' });
  });
});
