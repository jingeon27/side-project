import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
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
            overlay.open(({ isOpen: isDialogOpen, close: onDialogClose, unmount: unmountDialog }) => (
              <ConfirmDialog
                isOpen={isDialogOpen}
                onClose={onDialogClose}
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

function renderSheetOpener(onDelete: () => void) {
  const user = userEvent.setup();
  render(
    <OverlayProvider>
      <button
        type="button"
        onClick={() =>
          overlay.open(({ isOpen, close: onClose, unmount }) => (
            <ModerationBottomSheet isOpen={isOpen} onClose={onClose} unmount={unmount} onDelete={onDelete} />
          ))
        }
      >
        관리
      </button>
    </OverlayProvider>,
  );
  return user;
}

async function openDialogOnSheet(onDelete: () => void) {
  const user = renderSheetOpener(onDelete);
  const opener = screen.getByRole('button', { name: '관리' });
  await user.click(opener);
  await screen.findByRole('dialog', { name: '사진 관리' });
  await user.click(screen.getByRole('button', { name: '삭제' }));
  const alert = await screen.findByRole('alertdialog', { name: '사진을 삭제할까요?' });
  await waitFor(() => expect(screen.getByRole('button', { name: '취소' })).toHaveFocus());
  return { user, opener, alert };
}

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('시트 위에 연 확인 대화상자', () => {
  it('시트 위에서도 포커스·조작이 되고, 닫으면 시트의 버튼으로 포커스가 돌아가야 한다', async () => {
    const onDelete = vi.fn();
    const user = renderSheetOpener(onDelete);

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

  it('Escape 한 번에 맨 위 한 겹만 닫고, 포커스와 뒤로 가기 기록도 한 겹씩 돌아가야 한다', async () => {
    const onDelete = vi.fn();
    const { user, opener } = await openDialogOnSheet(onDelete);

    // 확인 대화상자가 열린 동안 아래 시트는 보조기기에서 가려진다.
    expect(screen.queryByRole('dialog', { name: '사진 관리' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '사진 관리', hidden: true })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '사진 관리' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '삭제' })).toHaveFocus());
    expect(hasOpenOverlay()).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(hasOpenOverlay()).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('확인 대화상자 바깥을 누른 뒤 Escape를 눌러도 확인 대화상자만 닫고 시트는 남겨야 한다', async () => {
    const { user, alert } = await openDialogOnSheet(vi.fn());

    // 대화상자 둘레의 어두운 영역(Viewport)을 누르면 닫히지 않고 포커스만 body로 빠진다.
    const dimmedArea = screen.getAllByRole('presentation').find((element) => element.contains(alert));
    if (!dimmedArea) throw new Error('확인 대화상자의 바깥 영역이 없다');
    await user.click(dimmedArea);
    expect(screen.getByRole('alertdialog', { name: '사진을 삭제할까요?' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '사진 관리' })).toBeInTheDocument();
    expect(hasOpenOverlay()).toBe(true);
  });
});
