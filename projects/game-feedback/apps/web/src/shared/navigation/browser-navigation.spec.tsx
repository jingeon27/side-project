import { afterEach, describe, expect, it } from 'vitest';

import { appRoutes } from '@game-feedback/bridge';

import {
  backNavigation,
  feedDestination,
  getNavigationDirection,
  installBrowserNavigation,
  registerLogicalParent,
} from './browser-navigation';

let stop = () => {};
afterEach(() => stop());
function start(path: string) {
  window.history.replaceState({ __NA: true, tree: 'next-router-tree' }, '', path);
  stop = installBrowserNavigation();
}
describe('application history', () => {
  it('가입 안내는 이전 게시판으로 돌아가고 직접 진입하면 복귀 경로를 사용해야 한다', () => {
    const parent = appRoutes.boards('ko', 'coaching', '주말', undefined, { coachingRole: 'STUDENT' });
    start(parent);
    window.history.pushState({}, '', appRoutes.onboarding('ko', parent));
    expect(backNavigation()).toEqual({ action: 'back' });
    stop();
    start(appRoutes.onboarding('ko', parent));
    expect(backNavigation()).toEqual({ action: 'replace', path: parent });
  });
  it('인증 화면 사이의 이전 방문 기록으로 돌아가지 않고 논리적 부모로 이동해야 한다', () => {
    const parent = '/en/terms';
    for (const [before, current] of [
      ['login', 'onboarding'],
      ['onboarding', 'login'],
    ] as const) {
      start(appRoutes[before]('en', parent));
      window.history.pushState({}, '', appRoutes[current]('en', parent));
      expect(backNavigation()).toEqual({ action: 'replace', path: parent });
      stop();
    }
  });
  it('returns from a composer to its source and uses the correct parent on a cold link', () => {
    start('/ko?tab=unanswered&q=hog');
    window.history.pushState({}, '', '/ko/write');
    expect(backNavigation()).toEqual({ action: 'back' });
    expect(feedDestination('/ko')).toBe('/ko?tab=unanswered&q=hog');
    stop();
    start('/ko/write?board=coaching&game=another-game');
    expect(backNavigation()).toEqual({ action: 'replace', path: '/ko/boards/coaching?game=another-game' });
  });
  it('uses a loaded board parent for a canonical detail URL and releases it on unmount', () => {
    start('/ko/posts/post-board');
    const release = registerLogicalParent('/ko/boards/friendly');
    expect(backNavigation()).toEqual({ action: 'replace', path: '/ko/boards/friendly' });
    release();
    expect(backNavigation()).toEqual({ action: 'replace', path: '/ko' });
  });
  it('preserves Next state and the filtered source when details are pushed', () => {
    start('/ko?tab=unanswered&q=%ED%98%B8%EA%B7%B8');
    window.history.pushState({ __NA: true, tree: 'post-tree' }, '', '/ko/posts/post-1');
    expect(window.history.state).toMatchObject({ __NA: true, tree: 'post-tree' });
    expect(backNavigation()).toEqual({ action: 'back' });
    expect(getNavigationDirection()).toBe('forward');
    expect(feedDestination('/ko')).toBe('/ko?tab=unanswered&q=%ED%98%B8%EA%B7%B8');
    window.history.replaceState(
      { ...window.history.state, tree: 'refreshed-tree' },
      '',
      window.location.href,
    );
    expect(backNavigation()).toEqual({ action: 'back' });
  });
  it('replaces root tabs and returns to the last feed without creating tab history', () => {
    start('/ko?q=%ED%98%B8%EA%B7%B8');
    const length = window.history.length;
    window.history.replaceState(window.history.state, '', '/ko/settings');
    window.history.replaceState(window.history.state, '', '/ko/notifications');
    expect(window.history.length).toBe(length);
    expect(backNavigation()).toEqual({ action: 'replace', path: '/ko?q=%ED%98%B8%EA%B7%B8' });
  });
  it('uses parent routes for cold links and identifies the feed as the app root', () => {
    start('/ja/messages/room-1');
    expect(backNavigation()).toEqual({ action: 'replace', path: '/ja/messages' });
    window.history.replaceState(window.history.state, '', '/ja/messages');
    expect(backNavigation()).toEqual({ action: 'replace', path: '/ja' });
    window.history.replaceState(window.history.state, '', '/ja');
    expect(backNavigation()).toEqual({ action: 'root' });
  });
  it('recognizes a browser pop without changing the restored route or framework state', async () => {
    start('/ko');
    window.history.pushState({ __NA: true, tree: 'post-tree' }, '', '/ko/posts/post-1');
    window.history.pushState({ __NA: true, tree: 'profile-tree' }, '', '/ko/users/user-1');
    const popped = new Promise<void>((resolve) =>
      window.addEventListener('popstate', () => resolve(), { once: true }),
    );
    window.history.back();
    await popped;
    expect(window.location.pathname).toBe('/ko/posts/post-1');
    expect(window.history.state.tree).toBe('post-tree');
    expect(getNavigationDirection()).toBe('back');
  });
});
