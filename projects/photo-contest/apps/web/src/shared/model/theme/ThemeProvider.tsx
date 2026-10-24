'use client';

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DARK_THEME_COLOR, THEME_COLOR } from '../../constants/layout';
import { THEME_COOKIE, type TThemePreference } from './theme-preference';

interface IThemeContext {
  preference: TThemePreference;
  setPreference: (preference: TThemePreference) => void;
}

const ThemeContext = createContext<IThemeContext | null>(null);

export function ThemeProvider({
  children,
  initialPreference,
}: {
  children: ReactNode;
  initialPreference: TThemePreference;
}) {
  const [preference, setTheme] = useState(initialPreference);
  const setPreference = useCallback((value: TThemePreference) => {
    document.documentElement.dataset.theme = value;
    document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setTheme(value);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      document.documentElement.dataset.theme = preference;
      const dark = preference === 'dark' || (preference === 'system' && media.matches);
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
        meta.content = dark ? DARK_THEME_COLOR : THEME_COLOR;
      }
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [preference]);
  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useThemePreference() {
  const context = use(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required.');
  return context;
}
