import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routeHistoryStore } from './route-history.store';
import { useRouteHistoryTracker } from './route-tracker.hook';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => {
  navigation.pathname = '/';
});

describe('useRouteHistoryTracker', () => {
  it('경로가 바뀔 때마다 기록 깊이를 늘리고 뒤로 가기로 돌아오면 줄여야 한다', () => {
    const { rerender } = renderHook(() => useRouteHistoryTracker());
    expect(routeHistoryStore.getDepth()).toBe(0);

    navigation.pathname = '/groups/g1';
    rerender();
    expect(routeHistoryStore.getDepth()).toBe(1);

    navigation.pathname = '/contests/c1';
    rerender();
    expect(routeHistoryStore.getDepth()).toBe(2);

    act(() => {
      window.history.replaceState(null, '', '/groups/g1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    navigation.pathname = '/groups/g1';
    rerender();
    expect(routeHistoryStore.getDepth()).toBe(1);
  });

  it('같은 경로로 다시 그려지면 기록을 바꾸지 않아야 한다', () => {
    const { rerender } = renderHook(() => useRouteHistoryTracker());
    rerender();
    rerender();
    expect(routeHistoryStore.getDepth()).toBe(0);
  });
});
