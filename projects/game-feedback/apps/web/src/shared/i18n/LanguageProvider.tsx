'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import { LoaderCircle } from 'lucide-react';

import {
  LANGUAGE_COOKIE,
  languagePreference,
  localePath,
  type TLanguagePreference,
  type TLocale,
} from './locale';
import { translate } from './messages';

const preferenceEvent = 'game-feedback:language';
interface ILanguageContext {
  locale: TLocale;
  automaticLocale: TLocale;
  preference: TLanguagePreference;
  pending: boolean;
  changePreference: (preference: TLanguagePreference) => void;
}
const LanguageContext = createContext<ILanguageContext>({
  locale: 'ko',
  automaticLocale: 'ko',
  preference: 'auto',
  pending: false,
  changePreference: () => {},
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
  const locale = initialLocale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const preference = useSyncExternalStore(subscribe, readPreference, () => initialPreference);
  function handlePreferenceChange(next: TLanguagePreference) {
    if (pending || next === preference) return;
    setLanguagePreference(next);
    const target = next === 'auto' ? automaticLocale : next;
    if (target === locale) return;
    startTransition(() => {
      router.replace(
        localePath(window.location.pathname + window.location.search + window.location.hash, target),
        { scroll: false },
      );
    });
  }
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <LanguageContext.Provider
      value={{ locale, preference, automaticLocale, pending, changePreference: handlePreferenceChange }}
    >
      {children}
      {pending && (
        <div className="preference-progress" role="status">
          <LoaderCircle size={16} className="spin" aria-hidden />
          {translate(locale, '언어를 변경하고 있어요')}
        </div>
      )}
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
