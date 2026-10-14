import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider, overlay } from 'overlay-kit';
import { afterEach, describe, expect, it } from 'vitest';

import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { hasOpenOverlay } from '../../../model/router';
import { BottomSheet } from './BottomSheet';

function CreateGroupBottomSheet({ isOpen, onClose, unmount }: IOverlayControlProps) {
  return (
    <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount}>
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

function Opener() {
  return (
    <button
      type="button"
      onClick={() =>
        overlay.open(({ isOpen, close, unmount }) => (
          <CreateGroupBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />
        ))
      }
    >
      그룹 만들기 열기
    </button>
  );
}

async function openSheet() {
  const user = userEvent.setup();
  render(
    <OverlayProvider>
      <Opener />
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
  it('제목을 이름으로 가진 대화상자로 열리고 본문과 하단 버튼을 보여 줘야 한다', async () => {
    const { sheet, user } = await openSheet();
    expect(sheet).toHaveAccessibleDescription('친구들과 함께할 그룹 이름을 정해요.');
    expect(screen.getByLabelText('그룹 이름')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '만들기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('닫기 버튼으로 닫으면 시트를 연 버튼으로 포커스가 돌아가고 history 항목을 걷어야 한다', async () => {
    const { user, opener } = await openSheet();
    await user.click(screen.getByRole('button', { name: '닫기' }));

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
