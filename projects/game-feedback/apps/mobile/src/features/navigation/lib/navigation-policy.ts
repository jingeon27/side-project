import { APP_CALLBACK, APP_SCHEME, WebPathSchema } from '@game-feedback/bridge';

export function isSameOrigin(url: string, origin: string) {
  return (
    url === origin ||
    url.startsWith(`${origin}/`) ||
    url.startsWith(`${origin}?`) ||
    url.startsWith(`${origin}#`)
  );
}
export function toWebPath(url: string, origin: string): string | null {
  if (url.length > 2048 || url.startsWith(APP_CALLBACK)) return null;
  const candidate = isSameOrigin(url, origin)
    ? url.slice(origin.length)
    : url.startsWith(`${APP_SCHEME}://`)
      ? `/${url.slice(APP_SCHEME.length + 3)}`
      : null;
  if (candidate === null) return null;
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
