import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

function renderOpener(onConfirm: () => unknown) {
  const user = userEvent.setup();
  render(
    <OverlayProvider>
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

  it('확인 동작이 끝날 때까지 버튼을 잠그고 성공하면 닫혀야 한다', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { user } = await open(onConfirm);

    await user.click(screen.getByRole('button', { name: '사진 삭제하기' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '사진 삭제하기' })).toHaveAttribute('aria-busy', 'true'),
    );
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('확인 동작이 실패하면 다시 시도할 수 있게 열어 둬야 한다', async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error('삭제 실패');
    });
    const { user } = await open(onConfirm);
    await user.click(screen.getByRole('button', { name: '사진 삭제하기' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '사진 삭제하기' })).not.toHaveAttribute('aria-busy'),
    );
    expect(screen.getByRole('alertdialog', { name: '사진을 삭제할까요?' })).toBeInTheDocument();
  });
});
