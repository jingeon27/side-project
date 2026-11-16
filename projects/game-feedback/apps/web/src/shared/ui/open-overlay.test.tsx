import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { overlay, OverlayProvider, useOverlayData } from 'overlay-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { BottomSheet } from './BottomSheet';
import { openOverlay } from './open-overlay';

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'getAnimations');
  overlay.unmountAll();
});

/** jsdom에는 Web Animations가 없어 닫기 전환이 즉시 끝난다. 실제 브라우저처럼 끝나지 않은 전환을 하나 둔다. */
function holdExitTransition() {
  const transition = Promise.withResolvers<void>();
  const running = {
    animations: [
      {
        finished: transition.promise,
        pending: false,
        playState: 'running',
        effect: { getTiming: () => ({ duration: 250, iterations: 1 }) },
      },
    ],
  };
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => running.animations,
  });
  return () => {
    running.animations = [];
    transition.resolve();
  };
}

function MountedOverlays() {
  return <output aria-label="열린 overlay 수">{Object.keys(useOverlayData()).length}</output>;
}

describe('overlay exit transition', () => {
  it('keeps a closed sheet mounted until its exit transition completes, then removes it', async () => {
    render(
      <OverlayProvider>
        <MountedOverlays />
        <button
          type="button"
          onClick={() =>
            openOverlay((control) => (
              <BottomSheet {...control} title="시트 제목">
                <p>시트 내용</p>
              </BottomSheet>
            ))
          }
        >
          열기
        </button>
      </OverlayProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '열기' }));
    await screen.findByRole('dialog', { name: '시트 제목' });
    const finishTransition = holdExitTransition();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    // 닫기 전환 중에는 시트와 overlay 항목이 남아 있어야 닫히는 모습이 보인다.
    expect(screen.getByText('시트 내용')).toBeTruthy();
    expect(screen.getByRole('status', { name: '열린 overlay 수' }).textContent).toBe('1');
    await act(async () => finishTransition());
    await waitFor(() => expect(screen.queryByText('시트 내용')).toBeNull());
    expect(screen.getByRole('status', { name: '열린 overlay 수' }).textContent).toBe('0');
  });
});
