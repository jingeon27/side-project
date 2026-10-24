import { APP_AUTH_CALLBACK_PATH, APP_SCHEME, WebPathSchema } from '@game-feedback/bridge';

export function isSameOrigin(url: string, origin: string) {
  return (
    url === origin ||
    url.startsWith(`${origin}/`) ||
    url.startsWith(`${origin}?`) ||
    url.startsWith(`${origin}#`)
  );
}
/** 소셜 로그인 콜백(`/app-auth/callback`)인지. 인증 세션만 이 주소를 받는다. */
function isAuthCallbackPath(path: string) {
  if (!path.startsWith(APP_AUTH_CALLBACK_PATH)) return false;
  return ['', '/', '?', '#'].includes(path.charAt(APP_AUTH_CALLBACK_PATH.length));
}
export function toWebPath(url: string, origin: string): string | null {
  if (url.length > 2048) return null;
  const candidate = isSameOrigin(url, origin)
    ? url.slice(origin.length)
    : url.startsWith(`${APP_SCHEME}://`)
      ? `/${url.slice(APP_SCHEME.length + 3)}`
      : null;
  // 인증 세션 밖에서 들어온 콜백(다른 앱이 시작한 흐름, 끝난 세션)은 일반 탐색으로 열지 않는다.
  if (candidate === null || isAuthCallbackPath(candidate)) return null;
  const normalized =
    candidate === '' || candidate === '/'
      ? '/ko'
      : candidate.startsWith('/?')
        ? `/ko${candidate.slice(1)}`
        : candidate;
  const result = WebPathSchema.safeParse(normalized);
  return result.success ? result.data : null;
}
export type TNavigation =
  { action: 'allow' | 'block' } | { action: 'navigate'; path: string } | { action: 'external'; url: string };
export function decideNavigation(url: string, origin: string): TNavigation {
  if (url === 'about:blank' || isSameOrigin(url, origin)) return { action: 'allow' };
  const path = toWebPath(url, origin);
  if (path) return { action: 'navigate', path };
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url) && !/[\s\\]/.test(url)) return { action: 'external', url };
  return { action: 'block' };
}
/** 하위 frame의 이동은 앱 화면 이동이나 외부 앱 열기로 이어지지 않는다. 같은 origin·about:blank만 그 frame 안에서 연다. */
export function decideSubframeNavigation(url: string, origin: string): { action: 'allow' | 'block' } {
  return decideNavigation(url, origin).action === 'allow' ? { action: 'allow' } : { action: 'block' };
}
