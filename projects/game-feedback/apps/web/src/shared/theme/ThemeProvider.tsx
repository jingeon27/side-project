'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { THEME_COOKIE, themePreference, type TThemePreference } from './theme';

const preferenceEvent = 'game-feedback:theme';
const ThemeContext = createContext<TThemePreference>('system');

function readPreference() {
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${THEME_COOKIE}=`))
    ?.split('=')[1];
  return themePreference(value);
}

function subscribe(onChange: () => void) {
  window.addEventListener(preferenceEvent, onChange);
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener(preferenceEvent, onChange);
    window.removeEventListener('focus', onChange);
  };
}

export function setThemePreference(value: TThemePreference) {
  document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  document.documentElement.dataset.theme = value;
  window.dispatchEvent(new Event(preferenceEvent));
}

export function ThemeProvider({
  children,
  initialPreference,
}: {
  children: ReactNode;
  initialPreference: TThemePreference;
}) {
  const preference = useSyncExternalStore(subscribe, readPreference, () => initialPreference);
  useEffect(() => {
    document.documentElement.dataset.theme = preference;
  }, [preference]);
  return <ThemeContext.Provider value={preference}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  return useContext(ThemeContext);
}
