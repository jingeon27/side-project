/** 화면 경로. 내부 링크·이동은 이 값으로만 만든다. */
export const ROUTES = {
  HOME: '/',
  ME: '/me',
  ONBOARDING: '/onboarding',
  EXPLORE: '/explore',
  TERMS: '/terms',
  PRIVACY: '/privacy',
  GROUP: (id: string) => `/groups/${encodeURIComponent(id)}`,
  GROUP_CONTESTS: (id: string) => `/groups/${encodeURIComponent(id)}/contests`,
  GROUP_HALL_OF_FAME: (id: string) => `/groups/${encodeURIComponent(id)}/hall-of-fame`,
  GROUP_CONTEST: (groupId: string, id: string) =>
    `/groups/${encodeURIComponent(groupId)}/contests/${encodeURIComponent(id)}`,
  CONTEST: (id: string) => `/contests/${encodeURIComponent(id)}`,
  INVITE: (token: string) => `/invite/${encodeURIComponent(token)}`,
} as const;

/** 같은 origin의 `/backend/*` 프록시(next.config rewrites)로 부르는 API 경로 */
export const BACKEND_ROUTES = {
  GRAPHQL: '/backend/graphql',
  AUTH_CONFIG: '/backend/auth/config',
  AUTH_DEV: '/backend/auth/dev',
  AUTH_LOGOUT: '/backend/auth/logout',
  AUTH_APP_EXCHANGE: '/backend/auth/app/exchange',
  AUTH_PROVIDER: (provider: 'google' | 'kakao') => `/backend/auth/${provider}`,
} as const;

/** 로그인해야 볼 수 있는 화면. proxy.ts matcher와 같은 목록이다. */
export const MEMBER_ONLY_PATH_PREFIXES = ['/contests/'] as const;
export const MEMBER_ONLY_PATHS = ['/me'] as const;
