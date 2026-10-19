'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { subscribeBrowserLocation } from './browser-navigation';

export function useBrowserSearch(initialSearch = '', pathname?: string) {
  const serverSnapshot = useCallback(() => initialSearch, [initialSearch]);
  const snapshot = useCallback(
    () => (pathname && window.location.pathname !== pathname ? initialSearch : window.location.search),
    [initialSearch, pathname],
  );
  return useSyncExternalStore(subscribeBrowserLocation, snapshot, serverSnapshot);
}
