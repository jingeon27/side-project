import type { MouseEvent } from 'react';

export const catalogPath = '/';
export const receiptLandingPath = '/cases/last-receipt/';
export const returnedKeyPath = '/cases/returned-key/';
export const wetMapPath = '/cases/wet-map/';

const navigationEvent = 'dawn:case-navigation';

export function matchesPagePath(pathname: string, route: string) {
  return pathname === route || pathname === route.slice(0, -1) || pathname === route + 'index.html';
}

export function caseHref(pathname: string) {
  const url = new URL(window.location.href);
  url.pathname = pathname;
  return url.pathname + url.search + url.hash;
}

export function followCaseLink(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  window.history.pushState(null, '', event.currentTarget.href);
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new Event(navigationEvent));
}

export function subscribeToCaseNavigation(onChange: () => void) {
  window.addEventListener(navigationEvent, onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(navigationEvent, onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function readCasePath() {
  return window.location.pathname;
}
