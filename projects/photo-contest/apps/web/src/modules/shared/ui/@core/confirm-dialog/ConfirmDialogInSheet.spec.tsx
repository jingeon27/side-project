import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider, overlay } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { hasOpenOverlay } from '../../../model/router';
import { BottomSheet } from '../bottom-sheet';
import { ConfirmDialog } from './ConfirmDialog';

function ModerationBottomSheet({
  isOpen,
  onClose,
  unmount,
  onDelete,
}: IOverlayControlProps & { onDelete: () => void }) {
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
      <BottomSheet.Header title="사진 관리" />
      <BottomSheet.Content>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen: isDialogOpen, close, unmount: unmountDialog }) => (
              <ConfirmDialog
                isOpen={isDialogOpen}
                onClose={close}
                unmount={unmountDialog}
                title="사진을 삭제할까요?"
                confirmLabel="사진 삭제하기"
                tone="danger"
                onConfirm={onDelete}
              />
            ))
          }
        >
          삭제
        </button>
      </BottomSheet.Content>
    </BottomSheet.Root>
  );
}

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('시트 위에 연 확인 대화상자', () => {
  it('시트 위에서도 포커스·조작이 되고, 닫으면 시트의 버튼으로 포커스가 돌아가야 한다', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <ModerationBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} onDelete={onDelete} />
            ))
          }
        >
          관리
        </button>
      </OverlayProvider>,
    );

    await user.click(screen.getByRole('button', { name: '관리' }));
    await screen.findByRole('dialog', { name: '사진 관리' });
    const deleteButton = screen.getByRole('button', { name: '삭제' });
    await user.click(deleteButton);

    await screen.findByRole('alertdialog', { name: '사진을 삭제할까요?' });
    await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(deleteButton).toHaveFocus());
    expect(screen.getByRole('dialog', { name: '사진 관리' })).toBeInTheDocument();

    // 뒤로 가기는 남은 시트를 닫는다.
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(hasOpenOverlay()).toBe(false);

    await user.click(screen.getByRole('button', { name: '관리' }));
    await user.click(await screen.findByRole('button', { name: '삭제' }));
    await user.click(await screen.findByRole('button', { name: '사진 삭제하기' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
