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
