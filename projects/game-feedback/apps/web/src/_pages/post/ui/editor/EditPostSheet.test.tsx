import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { describe, expect, it, vi } from 'vitest';

import type { Post } from '@/shared/api';
import { confirmNavigation, confirmOverlayClose, NavigationGuardProvider } from '@/shared/navigation';
import { openOverlay } from '@/shared/ui';
import type { PostContentFields } from '@/widgets/post-composer';

import { EditPostSheet } from './EditPostSheet';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/features/auth', () => ({ useSession: () => ({ session: { user: { id: 'writer' } } }) }));
vi.mock('@/shared/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/ui')>()),
  useNotify: () => vi.fn(),
}));
// 편집기 대신 제목만 폼에 넣는다. 닫기·이탈 확인은 EditPostSheet가 소유한다.
vi.mock('@/widgets/post-composer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/widgets/post-composer')>()),
  PostContentFields: ({ form }: Parameters<typeof PostContentFields>[0]) => (
    <input aria-label="제목" {...form.register('title')} />
  ),
}));

const post = {
  id: 'post-1',
  title: '처음 올린 제목',
  body: '처음 올린 본문',
  board: 'FEEDBACK',
  categoryId: 'clash-royale',
  category: { id: 'clash-royale', slug: 'clash-royale', name: '클래시로얄', active: true },
  author: { id: 'writer', nickname: '작성자', isVerified: false, supercellTag: null, isTestAccount: false },
  gameProfile: null,
  viewCount: 0,
  answerCount: 0,
  helpfulCount: 0,
  createdAt: '2026-11-11T00:00:00.000Z',
  updatedAt: '2026-11-11T00:00:00.000Z',
} satisfies Post;

async function renderSheet() {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NavigationGuardProvider>
        <EditPostSheet open onOpenChange={onOpenChange} post={post} />
      </NavigationGuardProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('dialog', { name: '피드백 요청 수정' });
  return onOpenChange;
}
function editTitle() {
  fireEvent.change(screen.getByRole('textbox', { name: '제목' }), { target: { value: '고치던 제목' } });
}

describe('게시글 수정 시트의 초안 보호', () => {
  it('고친 내용이 없으면 묻지 않고 Escape나 취소로 닫는다', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onOpenChange = await renderSheet();
    await userEvent.setup().keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('고친 내용은 Escape로 버리지 않고 취소할 때 확인한 뒤에만 닫는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onOpenChange = await renderSheet();
    editTitle();
    await userEvent.setup().keyboard('{Escape}');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '제목' }).value).toBe('고치던 제목');
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    // 버리기로 한 초안은 시트가 닫히는 동안 이탈 확인을 다시 묻지 않는다.
    expect(confirmNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('고친 내용이 있으면 화면을 떠나기 전에 확인하고, 떠나면 시트도 닫는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onOpenChange = await renderSheet();
    expect(confirmNavigation()).toBe(true);
    editTitle();
    expect(confirmNavigation()).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith(
      '저장하지 않은 변경이 있어요. 이 화면을 나가면 입력한 내용이 사라져요. 계속할까요?',
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => expect(confirmNavigation()).toBe(true));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(confirmNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  // 앱 back(NativeBridge)은 맨 위 오버레이를 닫기 전에 confirmOverlayClose(그 오버레이 id)로 확인한다.
  it('오버레이로 연 시트는 앱 back이 이 시트를 닫을 때만 확인하고, 승인하면 초안을 버리고 닫는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NavigationGuardProvider>
          <OverlayProvider />
        </NavigationGuardProvider>
      </QueryClientProvider>,
    );
    act(() => {
      openOverlay((control) => <EditPostSheet {...control} post={post} />, { overlayId: 'edit-post' });
    });
    await screen.findByRole('dialog', { name: '피드백 요청 수정' });
    editTitle();
    expect(confirmOverlayClose('another-overlay')).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(confirmOverlayClose('edit-post')).toBe(false);
    // 앱 back은 화면을 떠나지 않고 시트만 닫으므로 취소 버튼과 같은 문구로 묻는다.
    expect(confirm).toHaveBeenLastCalledWith('저장하지 않은 변경이 있어요. 닫으면 입력한 내용이 사라져요.');
    expect(screen.getByRole('dialog', { name: '피드백 요청 수정' })).toBeTruthy();
    confirm.mockReturnValue(true);
    await act(async () => expect(confirmOverlayClose('edit-post')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '피드백 요청 수정' })).toBeNull());
    expect(confirmNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    act(() => overlay.unmountAll());
  });
});
