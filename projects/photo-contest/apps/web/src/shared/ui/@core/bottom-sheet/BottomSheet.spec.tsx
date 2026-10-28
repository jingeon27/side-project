import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { hasOpenOverlay } from '../../../model/router';
import { BottomSheet } from './BottomSheet';

function CreateGroupBottomSheet({
  isOpen,
  onClose,
  unmount,
  resizable,
}: IOverlayControlProps & { resizable?: boolean }) {
  return (
    <BottomSheet.Root
      isOpen={isOpen}
      onClose={onClose}
      unmount={unmount}
      snapPoints={resizable ? [0.75, 1] : undefined}
    >
      <BottomSheet.Header title="그룹 만들기" description="친구들과 함께할 그룹 이름을 정해요." />
      <BottomSheet.Content>
        <label htmlFor="group-name">그룹 이름</label>
        <input id="group-name" />
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <button type="button" onClick={onClose}>
          만들기
        </button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}

function CommentsLikeBottomSheet({ isOpen, onClose, unmount }: IOverlayControlProps) {
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount} snapPoints={[0.75, 1]}>
      <BottomSheet.Header title="댓글" closeLabel="닫기" />
      <BottomSheet.Content>첫 댓글</BottomSheet.Content>
      <BottomSheet.Footer cancelLabel={false}>
        <button type="button">댓글 올리기</button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}

function Opener({ resizable, onUnmount }: { resizable?: boolean; onUnmount?: () => void }) {
  return (
    <button
      type="button"
      onClick={() =>
        overlay.open(({ isOpen, close: onClose, unmount }) => (
          <CreateGroupBottomSheet
            isOpen={isOpen}
            onClose={onClose}
            unmount={() => {
              onUnmount?.();
              unmount();
            }}
            resizable={resizable}
          />
        ))
      }
    >
      그룹 만들기 열기
    </button>
  );
}

async function openSheet({ onUnmount }: { onUnmount?: () => void } = {}) {
  const user = userEvent.setup();
  render(
    <OverlayProvider>
      <Opener onUnmount={onUnmount} />
    </OverlayProvider>,
  );
  const opener = screen.getByRole('button', { name: '그룹 만들기 열기' });
  await user.click(opener);
  const sheet = await screen.findByRole('dialog', { name: '그룹 만들기' });
  // 열린 시트는 history 항목을 하나 차지한다.
  await waitFor(() => expect(hasOpenOverlay()).toBe(true));
  return { user, opener, sheet };
}

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('BottomSheet', () => {
  it('크기 조절 시트는 상단 X 없이 하단 취소로 닫아야 한다', async () => {
    const user = userEvent.setup();
    render(
      <OverlayProvider>
        <Opener resizable />
      </OverlayProvider>,
    );
    await user.click(screen.getByRole('button', { name: '그룹 만들기 열기' }));
    const sheet = await screen.findByRole('dialog', { name: '그룹 만들기' });
    expect(sheet).toHaveAccessibleDescription('친구들과 함께할 그룹 이름을 정해요.');
    expect(screen.queryByRole('button', { name: /시트.*확장|시트 축소/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('크기 조절 시트는 손잡이를 키보드로 움직여 75%와 전체 높이를 오가야 한다', async () => {
    const user = userEvent.setup();
    render(
      <OverlayProvider>
        <Opener resizable />
      </OverlayProvider>,
    );
    await user.click(screen.getByRole('button', { name: '그룹 만들기 열기' }));
    const sheet = await screen.findByRole('dialog', { name: '그룹 만들기' });
    const handle = within(sheet).getByRole('slider', { name: '시트 높이 조절' });
    expect(handle).toHaveAttribute('aria-valuetext', '75%');
    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(handle).toHaveAttribute('aria-valuetext', '100%');
    await user.keyboard('{Home}');
    expect(handle).toHaveAttribute('aria-valuetext', '75%');
  });

  it('높이가 정해지지 않은 시트는 높이 조절 손잡이를 그리지 않아야 한다', async () => {
    const { sheet } = await openSheet();
    expect(within(sheet).queryByRole('slider')).not.toBeInTheDocument();
  });

  it('제목을 이름으로 가진 대화상자로 열리고 본문과 하단 버튼을 보여 줘야 한다', async () => {
    const { sheet, user } = await openSheet();
    expect(sheet).toHaveAccessibleDescription('친구들과 함께할 그룹 이름을 정해요.');
    expect(screen.getByLabelText('그룹 이름')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '만들기' })).toBeInTheDocument();
    // 하단 취소가 있는 시트는 제목 옆에 닫기 버튼을 따로 두지 않는다.
    expect(within(sheet).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('취소 버튼으로 닫으면 시트를 연 버튼으로 포커스가 돌아가고 history 항목을 걷어야 한다', async () => {
    const onUnmount = vi.fn();
    const { user, opener } = await openSheet({ onUnmount });
    await user.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(hasOpenOverlay()).toBe(false);
    // 닫힘 전환이 끝난 뒤 overlay-kit에서도 지워야 닫힌 시트가 쌓이지 않는다.
    await waitFor(() => expect(onUnmount).toHaveBeenCalledOnce());
  });

  it('하단 취소가 없는 시트는 제목 옆 닫기 버튼으로 닫고 연 버튼으로 포커스를 돌려야 한다', async () => {
    const user = userEvent.setup();
    render(
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <CommentsLikeBottomSheet isOpen={isOpen} onClose={onClose} unmount={unmount} />
            ))
          }
        >
          댓글 열기
        </button>
      </OverlayProvider>,
    );
    const opener = screen.getByRole('button', { name: '댓글 열기' });
    await user.click(opener);
    const sheet = await screen.findByRole('dialog', { name: '댓글' });
    await waitFor(() => expect(hasOpenOverlay()).toBe(true));
    expect(within(sheet).queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    const close = within(sheet).getByRole('button', { name: '닫기' });
    expect(close.closest('[data-slot="bottom-sheet-header"]')).not.toBeNull();

    await user.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(hasOpenOverlay()).toBe(false);
  });

  it('Esc로 닫을 수 있어야 한다', async () => {
    const { user, opener } = await openSheet();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('브라우저·안드로이드 뒤로 가기는 화면 대신 시트를 먼저 닫아야 한다', async () => {
    const pathBefore = window.location.pathname;
    await openSheet();
    act(() => window.history.back());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.pathname).toBe(pathBefore);
    expect(hasOpenOverlay()).toBe(false);
  });
});
