import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Author } from '@/shared/api';

import { ProfileActionsMenu } from './ProfileActionsMenu';

const actions = vi.hoisted(() => ({
  session: vi.fn(),
  login: vi.fn(),
  report: vi.fn(),
  overlay: vi.fn(),
  notify: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: actions.replace, refresh: actions.refresh }),
}));
vi.mock('@/features/auth', () => ({ useSession: actions.session }));
vi.mock('@/shared/ui', () => ({ openOverlay: actions.overlay, useNotify: () => actions.notify }));
vi.mock('@/widgets/moderation', () => ({ openUserReport: actions.report, BlockUserDialog: () => null }));

const author = {
  id: 'peer',
  nickname: '덱연구소',
  avatarUrl: null,
  isVerified: true,
  supercellTag: null,
  isTestAccount: false,
} satisfies Author;

beforeEach(() => {
  vi.clearAllMocks();
  actions.session.mockReturnValue({ session: { user: { id: 'viewer' } }, requireLogin: actions.login });
});

describe('profile actions menu', () => {
  it('offers report before block, supports keyboard dismissal and preserves the report target', async () => {
    const user = userEvent.setup();
    render(<ProfileActionsMenu author={author} locale="ko" />);
    const trigger = screen.getByRole('button', { name: '덱연구소님의 프로필 메뉴' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const report = await screen.findByRole('menuitem', { name: '사용자 신고' });
    const block = screen.getByRole('menuitem', { name: '사용자 차단' });
    expect(screen.getAllByRole('menuitem')).toEqual([report, block]);
    await waitFor(() => expect(document.activeElement).toBe(report));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(block);
    expect(block.getAttribute('data-variant')).toBe('danger');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: '사용자 신고' }));
    expect(actions.report).toHaveBeenCalledExactlyOnceWith(author.id);
  });

  it('keeps both anonymous actions behind the existing login gate', async () => {
    actions.session.mockReturnValue({ session: { user: null }, requireLogin: actions.login });
    const user = userEvent.setup();
    render(<ProfileActionsMenu author={author} locale="ko" />);
    const trigger = screen.getByRole('button', { name: '덱연구소님의 프로필 메뉴' });
    for (const name of ['사용자 신고', '사용자 차단']) {
      await user.click(trigger);
      await user.click(await screen.findByRole('menuitem', { name }));
    }
    expect(actions.login).toHaveBeenCalledTimes(2);
    expect(actions.report).not.toHaveBeenCalled();
    expect(actions.overlay).not.toHaveBeenCalled();
  });

  it('opens the existing block confirmation once for another signed-in user', async () => {
    const user = userEvent.setup();
    render(<ProfileActionsMenu author={author} locale="ko" />);
    await user.click(screen.getByRole('button', { name: '덱연구소님의 프로필 메뉴' }));
    await user.click(await screen.findByRole('menuitem', { name: '사용자 차단' }));
    expect(actions.overlay).toHaveBeenCalledOnce();
    expect(actions.login).not.toHaveBeenCalled();
  });

  it('does not expose moderation actions on the viewer’s own profile', () => {
    actions.session.mockReturnValue({ session: { user: { id: author.id } }, requireLogin: actions.login });
    render(<ProfileActionsMenu author={author} locale="ko" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
