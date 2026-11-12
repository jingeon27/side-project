import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@side/design-system';

import { BottomSheet } from './BottomSheet';
import { openOverlay } from './open-overlay';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(() => overlay.unmountAll());

describe('overlay error isolation', () => {
  it('keeps the service mounted when an overlay controller fails, then retries it', async () => {
    let failed = true;
    function BrokenController() {
      if (failed) throw new Error('private dialog payload');
      return <p>복구된 작성 창</p>;
    }
    render(
      <OverlayProvider>
        <p>정상 피드</p>
        <button onClick={() => openOverlay(BrokenController)}>작성</button>
      </OverlayProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '작성' }));
    expect(await screen.findByRole('dialog', { name: '창을 불러오지 못했어요' })).toBeTruthy();
    expect(screen.getByText('정상 피드')).toBeTruthy();
    expect(screen.queryByText('private dialog payload')).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    await screen.findByText('복구된 작성 창');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes and unmounts a failed overlay, then lets the user open another one', async () => {
    function BrokenController(): never {
      throw new Error('broken overlay');
    }
    render(
      <OverlayProvider>
        <button onClick={() => openOverlay(BrokenController, { overlayId: 'broken' })}>작성</button>
      </OverlayProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '작성' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '작성' }));
    await screen.findByRole('dialog');
  });
});

describe('overlays opened from a menu', () => {
  it('moves focus into a sheet opened from a menu item, then returns it to the menu trigger on close', async () => {
    const user = userEvent.setup();
    render(
      <OverlayProvider>
        <DropdownMenu>
          <DropdownMenuTrigger>대화 메뉴</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() =>
                openOverlay((control) => (
                  <BottomSheet {...control} title="대화내역 삭제">
                    <p>현재까지의 대화내역을 삭제해요.</p>
                  </BottomSheet>
                ))
              }
            >
              대화내역 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </OverlayProvider>,
    );
    const trigger = screen.getByRole('button', { name: '대화 메뉴' });
    trigger.focus();

    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '대화내역 삭제' })),
    );
    await user.keyboard('{Enter}');
    const sheet = await screen.findByRole('dialog', { name: '대화내역 삭제' });
    // 메뉴가 닫히며 트리거로 돌려준 포커스를 시트가 가져간 뒤에 닫아야 복귀를 확인할 수 있다.
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
