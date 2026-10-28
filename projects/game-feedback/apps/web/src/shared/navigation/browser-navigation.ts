import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

import { confirmNavigation } from './navigation-guard';

const stateKey = '__game_feedback_navigation';
const logicalParents = new Map<string, { parent: string }>();
export type TNavigationDirection = 'forward' | 'back' | 'replace';
interface INavigationState {
  /** 링크가 다음 push로 여는 화면의 논리적 상위(링크를 누른 화면). push된 기록 항목에 남긴다. */
  pendingParent: { target: string; parent: string } | null;
  direction: TNavigationDirection;
}
const navigation: INavigationState = { pendingParent: null, direction: 'replace' };
const locationListeners = new Set<() => void>();
export function subscribeBrowserLocation(listener: () => void) {
  locationListeners.add(listener);
  return () => {
    locationListeners.delete(listener);
  };
}
function notifyLocation() {
  // Next also replaces history during its insertion effect; notify after the commit.
  queueMicrotask(() => {
    for (const listener of locationListeners) listener();
  });
}
interface INavigationEntry {
  index: number;
  previous: string | null;
  feed?: string;
  parent?: string;
}
function entry(state: unknown): INavigationEntry | null {
  if (!state || typeof state !== 'object' || !(stateKey in state)) return null;
  const value: unknown = state[stateKey];
  if (!value || typeof value !== 'object' || !('index' in value) || !('previous' in value)) return null;
  if (!Number.isSafeInteger(value.index) || typeof value.index !== 'number') return null;
  if (value.previous !== null && (typeof value.previous !== 'string' || !resolveAppRoute(value.previous)))
    return null;
  const feed =
    'feed' in value && typeof value.feed === 'string' && resolveAppRoute(value.feed)?.screen === 'feed'
      ? value.feed
      : undefined;
  const parent =
    'parent' in value && typeof value.parent === 'string' && resolveAppRoute(value.parent)
      ? value.parent
      : undefined;
  return {
    index: value.index,
    previous: value.previous,
    ...(feed ? { feed } : {}),
    ...(parent ? { parent } : {}),
  };
}
function withoutParent({ index, previous, feed }: INavigationEntry): INavigationEntry {
  return { index, previous, ...(feed ? { feed } : {}) };
}
function currentPath() {
  return window.location.pathname + window.location.search;
}
function routeOf(url: string | URL | null | undefined) {
  if (url === null || url === undefined) return null;
  const next = new URL(url, window.location.href);
  return resolveAppRoute(next.pathname + next.search);
}
export function getNavigationDirection() {
  return navigation.direction;
}
export function installBrowserNavigation() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  // 이 설치의 현재 기록 항목. 해제 뒤에는 원래 history 함수로만 넘긴다.
  const installation = {
    current: entry(history.state) ?? { index: 0, previous: null },
    active: true,
    restoring: false,
  };
  function stateWithEntry(data: unknown, next: INavigationEntry) {
    return { ...(data && typeof data === 'object' ? data : {}), [stateKey]: next };
  }
  function rememberFeed(next: INavigationEntry): INavigationEntry {
    const route = resolveAppRoute(currentPath());
    return route?.screen === 'feed' ? { ...next, feed: route.path } : next;
  }
  installation.current = rememberFeed(installation.current);
  replace.call(history, stateWithEntry(history.state, installation.current), '', window.location.href);
  const handlePush: History['pushState'] = function (data, unused, url) {
    if (!installation.active) return push.call(history, data, unused, url);
    const previous = resolveAppRoute(currentPath())?.path ?? null;
    const pending = navigation.pendingParent;
    const parent = pending && pending.target === routeOf(url)?.path ? pending.parent : undefined;
    navigation.pendingParent = null;
    installation.current = rememberFeed({
      ...withoutParent(installation.current),
      index: installation.current.index + 1,
      previous,
      ...(parent ? { parent } : {}),
    });
    navigation.direction = 'forward';
    push.call(history, stateWithEntry(data, installation.current), unused, url);
    notifyLocation();
  };
  const handleReplace: History['replaceState'] = function (data, unused, url) {
    if (!installation.active) return replace.call(history, data, unused, url);
    // 등록한 상위는 그 화면(같은 경로의 필터 변경 포함)에만 둔다. 다른 화면으로 바꾸면 버린다.
    const samePath = !url || routeOf(url)?.pathname === resolveAppRoute(currentPath())?.pathname;
    const next = entry(data) ?? installation.current;
    installation.current = rememberFeed(samePath ? next : withoutParent(next));
    navigation.direction = 'replace';
    replace.call(history, stateWithEntry(data, installation.current), unused, url);
    notifyLocation();
  };
  function handlePop(event: PopStateEvent) {
    if (installation.restoring) {
      installation.restoring = false;
      event.stopImmediatePropagation();
      return;
    }
    const target = entry(event.state);
    if (target && target.index !== installation.current.index && !confirmNavigation()) {
      // Next가 화면을 바꾸기 전에 멈추고, 기록을 늘리지 않고 원래 항목으로 돌아간다.
      event.stopImmediatePropagation();
      installation.restoring = true;
      history.go(installation.current.index - target.index);
      return;
    }
    navigation.pendingParent = null;
    const next = target ?? { index: 0, previous: null };
    navigation.direction = next.index < installation.current.index ? 'back' : 'forward';
    installation.current = next;
    notifyLocation();
  }
  function handleClick(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link || link.hasAttribute('download') || link.hasAttribute('data-navigation-back')) return;
    if (link.target && link.target !== '_self') return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    const path = destination.pathname + destination.search;
    if (path === currentPath() || !resolveAppRoute(path) || confirmNavigation()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  history.pushState = handlePush;
  history.replaceState = handleReplace;
  window.addEventListener('popstate', handlePop, true);
  document.addEventListener('click', handleClick, true);
  return () => {
    installation.active = false;
    if (history.pushState === handlePush) history.pushState = push;
    if (history.replaceState === handleReplace) history.replaceState = replace;
    window.removeEventListener('popstate', handlePop, true);
    document.removeEventListener('click', handleClick, true);
  };
}
export function backNavigation(parentOnly = false) {
  const route = resolveAppRoute(currentPath());
  if (!route) return { action: 'unhandled' } as const;
  if (route.screen === 'feed') return { action: 'root' } as const;
  const currentEntry = entry(window.history.state);
  const previous = currentEntry?.previous;
  const authScreen = ['login', 'onboarding'].includes(route.screen);
  const previousRoute = previous ? resolveAppRoute(previous) : null;
  const detail = [
    'post',
    'compose',
    'profile',
    'profile-edit',
    'conversation',
    'login',
    'onboarding',
  ].includes(route.screen);
  const previousAuthScreen = previousRoute && ['login', 'onboarding'].includes(previousRoute.screen);
  if (
    previous &&
    detail &&
    !(authScreen && previousAuthScreen) &&
    (!parentOnly || previousRoute?.pathname === route.parent)
  )
    return { action: 'back' } as const;
  // 링크가 상위로 등록하고 연 화면(가이드 → 게시판·문의)은 그 기록으로 돌아간다.
  if (currentEntry?.parent && previous === currentEntry.parent) return { action: 'back' } as const;
  const parent =
    logicalParents.get(route.path)?.parent ??
    currentEntry?.parent ??
    route.parent ??
    appRoutes.feed(route.locale);
  return {
    action: 'replace',
    path: parent === appRoutes.feed(route.locale) ? feedDestination(parent) : parent,
  } as const;
}
export function registerLogicalParent(parent: string) {
  const route = resolveAppRoute(currentPath());
  const destination = resolveAppRoute(parent);
  if (!route || !destination || route.locale !== destination.locale) return () => {};
  const registration = { parent: destination.path };
  logicalParents.set(route.path, registration);
  return () => {
    if (logicalParents.get(route.path) === registration) logicalParents.delete(route.path);
  };
}
/** 다음 push로 열리는 href 화면의 논리적 상위를 현재 화면으로 등록한다(`ChildLink`). */
export function registerNextLogicalParent(href: string) {
  const route = resolveAppRoute(currentPath());
  const destination = resolveAppRoute(href);
  navigation.pendingParent =
    route && destination && route.locale === destination.locale
      ? { target: destination.path, parent: route.path }
      : null;
}
export function feedDestination(href: string) {
  const route = resolveAppRoute(href);
  const feed = entry(window.history.state)?.feed;
  return route?.screen === 'feed' &&
    route.path === appRoutes.feed(route.locale) &&
    feed &&
    resolveAppRoute(feed)?.locale === route.locale
    ? feed
    : href;
}
