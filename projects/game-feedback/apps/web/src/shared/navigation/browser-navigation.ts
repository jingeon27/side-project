import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

const stateKey = '__game_feedback_navigation';
const logicalParents = new Map<string, { parent: string }>();
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
}
export type TNavigationDirection = 'forward' | 'back' | 'replace';
let direction: TNavigationDirection = 'replace';
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
  return { index: value.index, previous: value.previous, ...(feed ? { feed } : {}) };
}
function currentPath() {
  return window.location.pathname + window.location.search;
}
export function getNavigationDirection() {
  return direction;
}
export function installBrowserNavigation() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  let current = entry(history.state) ?? { index: 0, previous: null };
  let active = true;
  function stateWithEntry(data: unknown, next: INavigationEntry) {
    return { ...(data && typeof data === 'object' ? data : {}), [stateKey]: next };
  }
  function rememberFeed(next: INavigationEntry): INavigationEntry {
    const route = resolveAppRoute(currentPath());
    return route?.screen === 'feed' ? { ...next, feed: route.path } : next;
  }
  current = rememberFeed(current);
  replace.call(history, stateWithEntry(history.state, current), '', window.location.href);
  const handlePush: History['pushState'] = function (data, unused, url) {
    if (!active) return push.call(history, data, unused, url);
    const previous = resolveAppRoute(currentPath())?.path ?? null;
    current = rememberFeed({ ...current, index: current.index + 1, previous });
    direction = 'forward';
    push.call(history, stateWithEntry(data, current), unused, url);
    notifyLocation();
  };
  const handleReplace: History['replaceState'] = function (data, unused, url) {
    if (!active) return replace.call(history, data, unused, url);
    current = rememberFeed(entry(data) ?? current);
    direction = 'replace';
    replace.call(history, stateWithEntry(data, current), unused, url);
    notifyLocation();
  };
  function handlePop(event: PopStateEvent) {
    const next = entry(event.state) ?? { index: 0, previous: null };
    direction = next.index < current.index ? 'back' : 'forward';
    current = next;
    notifyLocation();
  }
  history.pushState = handlePush;
  history.replaceState = handleReplace;
  window.addEventListener('popstate', handlePop);
  return () => {
    active = false;
    if (history.pushState === handlePush) history.pushState = push;
    if (history.replaceState === handleReplace) history.replaceState = replace;
    window.removeEventListener('popstate', handlePop);
  };
}
export function backNavigation(parentOnly = false) {
  const route = resolveAppRoute(currentPath());
  if (!route) return { action: 'unhandled' } as const;
  if (route.screen === 'feed') return { action: 'root' } as const;
  const previous = entry(window.history.state)?.previous;
  const authScreen = ['login', 'onboarding'].includes(route.screen);
  const previousRoute = previous ? resolveAppRoute(previous) : null;
  const detail = ['post', 'compose', 'profile', 'conversation', 'login', 'onboarding'].includes(route.screen);
  const previousAuthScreen = previousRoute && ['login', 'onboarding'].includes(previousRoute.screen);
  if (
    previous &&
    detail &&
    !(authScreen && previousAuthScreen) &&
    (!parentOnly || previousRoute?.pathname === route.parent)
  )
    return { action: 'back' } as const;
  const parent = logicalParents.get(route.path)?.parent ?? route.parent ?? appRoutes.feed(route.locale);
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
