import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_MAIN_ID } from '../../../constants/layout';
import { hasOpenOverlay } from '../../../model/router';
import { ConfirmDialog } from './ConfirmDialog';

function renderOpener(onConfirm: () => unknown) {
  const user = userEvent.setup();
  render(
    <OverlayProvider>
      <main id={APP_MAIN_ID} />
      <button
        type="button"
        onClick={() =>
          overlay.open(({ isOpen, close: onClose, unmount }) => (
            <ConfirmDialog
              isOpen={isOpen}
              onClose={onClose}
              unmount={unmount}
              title="사진을 삭제할까요?"
              description="투표와 좋아요, 신고 기록도 함께 지워져요."
              confirmLabel="사진 삭제하기"
              tone="danger"
              onConfirm={onConfirm}
            />
          ))
        }
      >
        삭제
      </button>
    </OverlayProvider>,
  );
  return user;
}

async function open(onConfirm: () => unknown) {
  const user = renderOpener(onConfirm);
  await user.click(screen.getByRole('button', { name: '삭제' }));
  const dialog = await screen.findByRole('alertdialog', { name: '사진을 삭제할까요?' });
  return { user, dialog };
}

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('ConfirmDialog', () => {
  it('설명을 읽어 주고 처음 포커스는 취소 버튼에 가야 한다', async () => {
    const { dialog } = await open(vi.fn());
    expect(screen.getByRole('main')).toContainElement(dialog);
    expect(dialog).toHaveAccessibleDescription('투표와 좋아요, 신고 기록도 함께 지워져요.');
    await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toHaveFocus());
  });

  it('취소하면 확인 동작 없이 닫혀야 한다', async () => {
    const onConfirm = vi.fn();
    const { user } = await open(onConfirm);
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: '삭제' })).toHaveFocus());
  });

  it('Escape로 닫으면 확인 동작 없이 닫히고 연 버튼과 뒤로 가기 기록을 되돌려야 한다', async () => {
    const onConfirm = vi.fn();
    const { user } = await open(onConfirm);
    await waitFor(() => expect(hasOpenOverlay()).toBe(true));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: '삭제' })).toHaveFocus());
    // 기록이 남으면 다음 뒤로 가기가 아무것도 닫지 않고 한 번 헛돈다.
    expect(hasOpenOverlay()).toBe(false);
  });

  it('확인 동작이 끝날 때까지 버튼을 잠그고 Escape·다시 누르기를 무시하다가 성공하면 닫혀야 한다', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { user } = await open(onConfirm);
    const confirm = screen.getByRole('button', { name: '사진 삭제하기' });

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    // 진행 중에도 포커스는 확인 버튼에 남는다.
    expect(confirm).toHaveFocus();

    await user.click(confirm);
    await user.keyboard('{Escape}');
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('alertdialog', { name: '사진을 삭제할까요?' })).toBeInTheDocument();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: '삭제' })).toHaveFocus());
  });

  it('확인 동작이 실패하면 잠금만 풀고 열어 두어 같은 자리에서 다시 시도할 수 있어야 한다', async () => {
    const attempts: { resolve: () => void; reject: (error: Error) => void }[] = [];
    const onConfirm = vi.fn(() => new Promise<void>((resolve, reject) => attempts.push({ resolve, reject })));
    const { user } = await open(onConfirm);
    const confirm = screen.getByRole('button', { name: '사진 삭제하기' });
    const cancel = screen.getByRole('button', { name: '취소' });

    await user.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(cancel).toBeDisabled();

    await act(async () => attempts[0]?.reject(new Error('삭제 실패')));
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-busy'));
    expect(cancel).toBeEnabled();
    expect(screen.getByRole('alertdialog', { name: '사진을 삭제할까요?' })).toBeInTheDocument();
    expect(confirm).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    await act(async () => attempts[1]?.resolve());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
