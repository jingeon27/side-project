import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OverlayProvider, overlay } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
