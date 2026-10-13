import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppRouter } from './app-router.hook';
import { hasOpenOverlay, pushOverlayEntry, releaseOverlayEntry } from './overlay-history.store';
import { routeHistoryStore } from './route-history.store';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/groups/g1');
  routeHistoryStore.start('navigate');
});

afterEach(() => {
  expect(hasOpenOverlay()).toBe(false);
});

describe('useAppRouter', () => {
  it('다른 화면으로 push하면 앱 안 기록을 하나 늘릴 준비를 해야 한다', () => {
    const { result } = renderHook(() => useAppRouter());
    result.current.push('/contests/c1');
    expect(router.push).toHaveBeenCalledWith('/contests/c1', undefined);
    routeHistoryStore.record('/contests/c1');
    expect(routeHistoryStore.getDepth()).toBe(1);
  });

  it('replace는 기록 깊이를 늘리지 않아야 한다', () => {
    const { result } = renderHook(() => useAppRouter());
    result.current.replace('/');
    expect(router.replace).toHaveBeenCalledWith('/', undefined);
    routeHistoryStore.record('/');
    expect(routeHistoryStore.getDepth()).toBe(0);
  });

  it('열린 시트에서 이동하면 시트의 history 항목을 replace하고 닫힐 때 back()하지 않아야 한다', () => {
    const back = vi.spyOn(window.history, 'back');
    const key = pushOverlayEntry(vi.fn());
    const { result } = renderHook(() => useAppRouter());

    result.current.push('/contests/c1');
    expect(router.replace).toHaveBeenCalledWith('/contests/c1', undefined);
    expect(router.push).not.toHaveBeenCalled();

    releaseOverlayEntry(key);
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });
});
