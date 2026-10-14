import { originOf } from '@photo-contest/bridge';

export interface ILinkOptions {
  /** 예: https://contest.example */
  webOrigin: string;
  /** 예: photocontest */
  appScheme: string;
}

const LINK_ROUTES = ['invite', 'groups', 'contests'] as const;
type TLinkRoute = (typeof LINK_ROUTES)[number];

/** 분석에 보내는 경로 모양. 초대 토큰과 ID 값은 보내지 않는다. */
const LINK_TEMPLATES = {
  invite: '/invite/:token',
  groups: '/groups/:id',
  contests: '/contests/:id',
} as const satisfies Record<TLinkRoute, string>;

/** 토큰·ID에는 안전 문자만 받는다. `..`, `%2F`, 공백 같은 값으로 다른 경로를 만들지 못하게 한다. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
/** React Native의 URL 구현이 불완전해 생성자 대신 정규식으로 나눈다. */
const HTTP_URL_PARTS = /^https?:\/\/[^\s/?#@]+([^\s]*)$/i;
const MAX_LINK_LENGTH = 2048;
/** 브리지 navigation.open이 받는 상대 경로와 같은 규칙. `//host`, `/\host`처럼 다른 origin으로 새는 값은 거부한다. */
const RELATIVE_PATH = /^\/(?![/\\])[^\s]*$/;

function isLinkRoute(value: string): value is TLinkRoute {
  return (LINK_ROUTES as readonly string[]).includes(value);
}

function stripQueryAndHash(value: string) {
  return value.split(/[?#]/, 1)[0] ?? '';
}

function pathFromSegments(rawPath: string) {
  const segments = rawPath.split('/');
  if (segments.length === 3 && segments[2] === '') segments.pop();
  const [route, id] = segments;
  if (segments.length !== 2 || !route || !id || !isLinkRoute(route) || !SAFE_SEGMENT.test(id)) return null;
  return `/${route}/${id}`;
}

/** WebView 주소로 붙여도 웹 origin을 벗어나지 않는 상대 경로인지 */
export function isRelativeWebPath(path: string) {
  return path.length <= MAX_LINK_LENGTH && RELATIVE_PATH.test(path);
}

/**
 * `photocontest://groups/<id>` 같은 앱 링크나 같은 경로의 웹 origin 링크(유니버설 링크)를 웹 경로로 바꾼다.
 * 모르는 링크와 `photocontest://auth/callback`(소셜 로그인 세션이 직접 받는다)은 null. 쿼리와 해시는 버린다.
 */
export function toWebPath(url: string, { webOrigin, appScheme }: ILinkOptions) {
  if (url.length > MAX_LINK_LENGTH) return null;
  const schemePrefix = `${appScheme}://`;
  if (url.slice(0, schemePrefix.length).toLowerCase() === schemePrefix.toLowerCase()) {
    const rest = stripQueryAndHash(url.slice(schemePrefix.length)).replace(/^\/+/, '');
    return pathFromSegments(rest);
  }
  const expectedOrigin = originOf(webOrigin);
  if (!expectedOrigin || originOf(url) !== expectedOrigin) return null;
  const rest = stripQueryAndHash(url.match(HTTP_URL_PARTS)?.[1] ?? '');
  if (rest === '' || rest === '/') return '/';
  return rest.startsWith('/') ? pathFromSegments(rest.slice(1)) : null;
}

/** toWebPath가 만든 경로를 분석용 path_template(`/groups/:id`)으로 바꾼다. 링크 경로가 아니면 null. */
export function toLinkTemplate(path: string) {
  if (path === '/') return '/';
  const linkPath = path.startsWith('/') ? pathFromSegments(path.slice(1)) : null;
  const route = linkPath?.split('/')[1];
  return route && isLinkRoute(route) ? LINK_TEMPLATES[route] : null;
}
