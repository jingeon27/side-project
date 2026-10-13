// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeTopOverlay,
  hasOpenOverlay,
  isOverlayEntryCurrent,
  markOverlayNavigation,
  pushOverlayEntry,
  releaseOverlayEntry,
} from './overlay-history.store';

const waitForPopState = () =>
  new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));

describe('overlay history', () => {
  afterEach(async () => {
    while (hasOpenOverlay()) {
      const popped = waitForPopState();
      closeTopOverlay();
      await popped;
    }
  });

  it('열 때 history 항목을 쌓고 뒤로 가기로 그 오버레이만 닫아야 한다', async () => {
    const before = window.history.length;
    const onBack = vi.fn();
    pushOverlayEntry(onBack);
    expect(window.history.length).toBe(before + 1);
    expect(isOverlayEntryCurrent()).toBe(true);

    const popped = waitForPopState();
    window.history.back();
    await popped;
    expect(onBack).toHaveBeenCalledOnce();
    expect(hasOpenOverlay()).toBe(false);
  });

  it('겹친 오버레이는 뒤로 가기 한 번에 맨 위 하나만 닫아야 한다', async () => {
    const closeSheet = vi.fn();
    const closeDialog = vi.fn();
    pushOverlayEntry(closeSheet);
    pushOverlayEntry(closeDialog);

    const popped = waitForPopState();
    expect(closeTopOverlay()).toBe(true);
    await popped;
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(closeSheet).not.toHaveBeenCalled();
    expect(hasOpenOverlay()).toBe(true);
  });

  it('닫기 버튼으로 닫으면 쌓았던 항목을 걷어 내야 한다', async () => {
    const onBack = vi.fn();
    const key = pushOverlayEntry(onBack);
    const popped = waitForPopState();
    releaseOverlayEntry(key);
    await popped;
    expect(isOverlayEntryCurrent()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('오버레이에서 다른 화면으로 이동 중이면 back()하지 않아야 한다', () => {
    const back = vi.spyOn(window.history, 'back');
    const key = pushOverlayEntry(vi.fn());
    markOverlayNavigation();
    releaseOverlayEntry(key);
    expect(back).not.toHaveBeenCalled();
    expect(hasOpenOverlay()).toBe(false);
    back.mockRestore();
  });

  it('닫을 오버레이가 없으면 false를 돌려줘야 한다', () => {
    expect(closeTopOverlay()).toBe(false);
  });
});
