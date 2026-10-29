import { originOf } from '@photo-contest/bridge';

import { isRelativeWebPath, toWebPath, type ILinkOptions } from './deep-link';

export type TNavigationDecision =
  /** WebView가 그대로 연다. */
  | { action: 'allow' }
  /** 아무것도 하지 않는다. */
  | { action: 'block' }
  /** 앱 스킴 링크. 웹 라우터로 그 경로에 간다. */
  | { action: 'open-in-web'; path: string }
  /** 시스템(브라우저·다른 앱)으로 연다. 대상 앱이 없으면 fallbackUrl을 연다. */
  | { action: 'open-external'; url: string; fallbackUrl: string | null };

export type TOpenWindowDecision = Exclude<TNavigationDecision, { action: 'allow' }>;

interface INavigationRequest {
  url: string;
  /** iOS만 준다. Android는 메인 프레임 요청만 이 판단을 거친다. */
  isTopFrame?: boolean;
}

const ALLOW = { action: 'allow' } as const satisfies TNavigationDecision;
const BLOCK = { action: 'block' } as const satisfies TNavigationDecision;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const BLANK_DOCUMENT = /^about:(?:blank|srcdoc)(?:[?#]|$)/i;
/** WebView 안에서도, 밖에서도 열 이유가 없고 문서를 바꾸거나 스크립트를 실행할 수 있는 스킴 */
const BLOCKED_SCHEMES = new Set([
  'javascript',
  'vbscript',
  'data',
  'blob',
  'file',
  'content',
  'filesystem',
  'about',
]);
const HTTP_URL_PARTS = /^https?:\/\/[^\s/?#@]+([^\s]*)$/i;
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

function readHttpFallback(value: string | undefined) {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * `intent://host/path#Intent;scheme=kakaolink;package=com.kakao.talk;S.browser_fallback_url=…;end`
 * Linking.openURL은 intent: URI를 해석하지 못해 대상 스킴 URL로 바꾸고, 앱이 없을 때 열 주소를 함께 돌려준다.
 */
function decideIntent(url: string, options: ILinkOptions): TNavigationDecision {
  const match = url.match(/^intent:\/\/([^#]*)#Intent;(.*?);?end;?$/i);
  if (!match) return BLOCK;
  const params = new Map<string, string>();
  for (const part of (match[2] ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0) params.set(part.slice(0, separator), part.slice(separator + 1));
  }
  const browserFallback = readHttpFallback(params.get('S.browser_fallback_url'));
  const packageName = params.get('package');
  const storeFallback =
    packageName && ANDROID_PACKAGE.test(packageName) ? `market://details?id=${packageName}` : null;
  const scheme = params.get('scheme')?.toLowerCase();
  const decision =
    scheme && scheme !== 'intent' && SCHEME.test(`${scheme}:`)
      ? decideNavigation({ url: `${scheme}://${match[1] ?? ''}` }, options)
      : BLOCK;
  if (decision.action === 'open-external')
    return { ...decision, fallbackUrl: browserFallback ?? storeFallback };
  if (decision.action === 'open-in-web') return decision;
  return browserFallback ? { action: 'open-external', url: browserFallback, fallbackUrl: null } : BLOCK;
}

/**
 * onShouldStartLoadWithRequest 판단. 웹 origin과 빈 문서만 WebView에서 열고,
 * 앱 스킴은 웹 라우터 이동으로 바꾸며, 나머지(다른 사이트·intent·카카오톡·전화 등)는 밖에서 연다.
 */
export function decideNavigation(
  { url, isTopFrame }: INavigationRequest,
  options: ILinkOptions,
): TNavigationDecision {
  if (BLANK_DOCUMENT.test(url)) return ALLOW;
  const scheme = url.match(SCHEME)?.[1]?.toLowerCase();
  if (!scheme) return BLOCK;
  if (scheme === 'http' || scheme === 'https') {
    if (originOf(url) === originOf(options.webOrigin)) return ALLOW;
    // 다른 origin iframe은 앱 문서를 바꾸지 않고, 브리지는 메시지를 보낸 프레임의 origin을 따로 검사한다.
    if (isTopFrame === false) return ALLOW;
    return { action: 'open-external', url, fallbackUrl: null };
  }
  // 하위 프레임(외부 임베드)은 사용자 동작 없이도 이동할 수 있으므로 앱 이동·외부 앱 열기를 맡기지 않는다.
  if (isTopFrame === false) return BLOCK;
  if (scheme === options.appScheme.toLowerCase()) {
    const path = toWebPath(url, options);
    return path ? { action: 'open-in-web', path } : BLOCK;
  }
  if (BLOCKED_SCHEMES.has(scheme)) return BLOCK;
  if (scheme === 'intent') return decideIntent(url, options);
  return { action: 'open-external', url, fallbackUrl: null };
}

/** window.open·target=_blank 판단. 앱에는 창이 하나뿐이라 같은 origin은 지금 WebView에서 이동한다. */
export function decideOpenWindow(url: string, options: ILinkOptions): TOpenWindowDecision {
  const decision = decideNavigation({ url, isTopFrame: true }, options);
  if (decision.action !== 'allow') return decision;
  const rest = url.match(HTTP_URL_PARTS)?.[1];
  if (rest === undefined) return BLOCK;
  const path = rest.startsWith('/') ? rest : `/${rest}`;
  return isRelativeWebPath(path) ? { action: 'open-in-web', path } : BLOCK;
}
