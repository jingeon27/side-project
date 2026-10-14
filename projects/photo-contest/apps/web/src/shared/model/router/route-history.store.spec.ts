// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { routeHistoryStore } from './route-history.store';

describe('routeHistoryStore', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    routeHistoryStore.start('navigate');
  });

  it('새로 들어온 문서는 기록 깊이 0에서 시작해야 한다', () => {
    expect(routeHistoryStore.getDepth()).toBe(0);
  });

  it('push는 깊이를 늘리고 replace는 그대로 두며 뒤로 가기는 줄여야 한다', () => {
    routeHistoryStore.record('/groups/g1');
    expect(routeHistoryStore.getDepth()).toBe(1);
    routeHistoryStore.expect('push');
    routeHistoryStore.record('/contests/c1');
    expect(routeHistoryStore.getDepth()).toBe(2);
    routeHistoryStore.expect('replace');
    routeHistoryStore.record('/contests/c2');
    expect(routeHistoryStore.getDepth()).toBe(2);
    routeHistoryStore.markTraversal('/groups/g1');
    routeHistoryStore.record('/groups/g1');
    expect(routeHistoryStore.getDepth()).toBe(1);
  });

  it('같은 화면 안의 popstate(오버레이 닫기)는 다음 이동을 뒤로 가기로 착각하지 않아야 한다', () => {
    routeHistoryStore.record('/contests/c1');
    routeHistoryStore.markTraversal('/contests/c1');
    routeHistoryStore.record('/groups/g1');
    expect(routeHistoryStore.getDepth()).toBe(2);
  });

  it('깊이는 0 아래로 내려가지 않아야 한다', () => {
    routeHistoryStore.markTraversal('/');
    routeHistoryStore.record('/');
    expect(routeHistoryStore.getDepth()).toBe(0);
  });

  it('새로고침하면 저장된 깊이를 이어 쓰고 새로 들어오면 0으로 돌아가야 한다', () => {
    routeHistoryStore.record('/groups/g1');
    routeHistoryStore.record('/contests/c1');
    routeHistoryStore.start('reload');
    expect(routeHistoryStore.getDepth()).toBe(2);
    routeHistoryStore.start('navigate');
    expect(routeHistoryStore.getDepth()).toBe(0);
  });

  it('구독자에게 바뀐 깊이를 알려야 한다', () => {
    const seen: number[] = [];
    const unsubscribe = routeHistoryStore.subscribe(() => seen.push(routeHistoryStore.getDepth()));
    routeHistoryStore.record('/groups/g1');
    unsubscribe();
    routeHistoryStore.record('/contests/c1');
    expect(seen).toEqual([1]);
  });
});
