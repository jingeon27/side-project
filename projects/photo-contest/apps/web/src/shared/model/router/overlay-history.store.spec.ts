// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeTopOverlay,
  hasOpenOverlay,
  isOverlayEntryCurrent,
  markOverlayNavigation,
  pushOverlayEntry,
  releaseOverlayEntry,
  resetOverlayNavigation,
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
    resetOverlayNavigation();
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

  it('첫 위치 기록과 중첩 항목을 만들 때 native·Next 상태를 보존하고 같은 위치를 중복 기록하지 않아야 한다', () => {
    const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { segment: 'home' }, custom: 'kept' };
    window.history.replaceState(state, '', '/');
    const replace = vi.spyOn(window.history, 'replaceState');
    try {
      pushOverlayEntry(vi.fn());
      expect(replace).toHaveBeenCalledOnce();
      expect(window.history.state).toMatchObject(state);
      pushOverlayEntry(vi.fn());
      expect(replace).toHaveBeenCalledOnce();
      expect(window.history.state).toMatchObject(state);
    } finally {
      replace.mockRestore();
    }
  });

  it('중첩 시트에서 이동한 뒤 닫힌 부모 항목을 뒤로·앞으로 방향대로 건너뛰어야 한다', async () => {
    const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { segment: 'write' } };
    window.history.replaceState({ __photoContestOverlayPosition: 0, custom: 'home' }, '', '/');
    const parent = pushOverlayEntry(vi.fn());
    const child = pushOverlayEntry(vi.fn());
    markOverlayNavigation();
    // Next가 실제 화면 이동을 커밋하며 자신의 상태로 현재 항목을 교체한다.
    window.history.replaceState(nextState, '', '/groups/g1/write');
    releaseOverlayEntry(child);
    releaseOverlayEntry(parent);
    resetOverlayNavigation();
    expect(hasOpenOverlay()).toBe(false);
    expect(window.history.state).toEqual({ ...nextState, __photoContestOverlayPosition: 2 });
    const replace = vi.spyOn(window.history, 'replaceState');
    resetOverlayNavigation();
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();

    const waitForPage = (pathname: string) =>
      new Promise<void>((resolve) => {
        const handlePopState = () => {
          if (window.location.pathname !== pathname || window.history.state?.__photoContestOverlay) return;
          window.removeEventListener('popstate', handlePopState);
          resolve();
        };
        window.addEventListener('popstate', handlePopState);
      });
    for (const iteration of [1, 2]) {
      const home = waitForPage('/');
      window.history.back();
      await home;
      expect(window.history.state).toEqual({ __photoContestOverlayPosition: 0, custom: 'home' });
      const write = waitForPage('/groups/g1/write');
      window.history.forward();
      await write;
      expect(window.history.state).toEqual({ ...nextState, __photoContestOverlayPosition: 2 });
      expect(hasOpenOverlay(), `이동 ${iteration} 후 닫힌 시트가 없어야 한다`).toBe(false);
    }
  });
});
