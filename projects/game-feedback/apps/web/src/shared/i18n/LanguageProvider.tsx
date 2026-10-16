'use client';
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  LANGUAGE_COOKIE,
  isLocale,
  languagePreference,
  type TLanguagePreference,
  type TLocale,
} from './locale';
import { translate } from './messages';

const preferenceEvent = 'game-feedback:language';
interface ILanguageContext {
  locale: TLocale;
  automaticLocale: TLocale;
  preference: TLanguagePreference;
}
const LanguageContext = createContext<ILanguageContext>({
  locale: 'ko',
  automaticLocale: 'ko',
  preference: 'auto',
});
function readPreference() {
  const value = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${LANGUAGE_COOKIE}=`))
    ?.split('=')[1];
  return languagePreference(value);
}
function subscribe(onChange: () => void) {
  window.addEventListener(preferenceEvent, onChange);
  window.addEventListener('focus', onChange);
  return () => {
    window.removeEventListener(preferenceEvent, onChange);
    window.removeEventListener('focus', onChange);
  };
}
export function setLanguagePreference(preference: TLanguagePreference) {
  document.cookie = `${LANGUAGE_COOKIE}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  window.dispatchEvent(new Event(preferenceEvent));
}
export function LanguageProvider({
  children,
  initialLocale,
  initialPreference,
  automaticLocale,
}: {
  children: ReactNode;
  initialLocale: TLocale;
  initialPreference: TLanguagePreference;
  automaticLocale: TLocale;
}) {
  const pathname = usePathname();
  const candidate = pathname?.split('/')[1];
  const locale = isLocale(candidate) ? candidate : initialLocale;
  const preference = useSyncExternalStore(subscribe, readPreference, () => initialPreference);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LanguageContext.Provider value={{ locale, preference, automaticLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useI18n() {
  const context = useContext(LanguageContext);
  return {
    ...context,
    t: (message: string, values?: Record<string, string | number>) =>
      translate(context.locale, message, values),
  };
}
