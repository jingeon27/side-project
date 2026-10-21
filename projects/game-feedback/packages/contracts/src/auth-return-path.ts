import { z } from 'zod';

function languagePath(path: string) {
  const locale = path.match(/^\/(ko|en|ja)(?:\/|\?|$)/)?.[1];
  if (!locale || /[\\#\u0000-\u0020\u007f]/.test(path)) return null;
  const destination = new URL(path, 'https://auth-return.invalid');
  if (
    destination.origin !== 'https://auth-return.invalid' ||
    !new RegExp(`^/${locale}(?:/|$)`).test(destination.pathname)
  )
    return null;
  return { destination, locale };
}

function isAuthPath(pathname: string) {
  return /^\/(ko|en|ja)\/(login|onboarding)(?:\/|$)/.test(pathname);
}

/** OAuth 목적지는 같은 서비스의 언어 경로로 제한한다. 화면별 복귀 문맥은 웹 라우터가 검증한다. */
export const AuthReturnPathSchema = z
  .string()
  .max(2048)
  .refine((path) => {
    const parsed = languagePath(path);
    if (!parsed) return false;
    if (!isAuthPath(parsed.destination.pathname)) return true;
    if (!/^\/(ko|en|ja)\/(login|onboarding)\/?$/.test(parsed.destination.pathname)) return false;
    const destinations = parsed.destination.searchParams.getAll('returnTo');
    if (destinations.length === 0) return true;
    if (destinations.length !== 1) return false;
    const nested = languagePath(destinations[0] ?? '');
    return !!nested && nested.locale === parsed.locale && !isAuthPath(nested.destination.pathname);
  }, '로그인 후 돌아갈 서비스 경로를 확인해주세요.');
