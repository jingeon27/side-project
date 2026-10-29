/** 화면 경로. 내부 링크·이동은 이 값으로만 만든다. */
export const ROUTES = {
  HOME: '/',
  SIGN: '/sign',
  ME: '/me',
  GROUP_CREATE: '/groups/new',
  NOTIFICATIONS: '/notifications',
  ONBOARDING: '/onboarding',
  EXPLORE: '/explore',
  TERMS: '/terms',
  PRIVACY: '/privacy',
  GROUP: (id: string) => `/groups/${encodeURIComponent(id)}`,
  GROUP_WRITE: (id: string, contestId?: string) =>
    `/groups/${encodeURIComponent(id)}/write${contestId ? `?${new URLSearchParams({ contestId })}` : ''}`,
  GROUP_CONTESTS: (id: string) => `/groups/${encodeURIComponent(id)}/contests`,
  GROUP_HALL_OF_FAME: (id: string) => `/groups/${encodeURIComponent(id)}/hall-of-fame`,
  GROUP_CONTEST: (groupId: string, id: string) =>
    `/groups/${encodeURIComponent(groupId)}/contests/${encodeURIComponent(id)}`,
  CONTEST: (id: string) => `/contests/${encodeURIComponent(id)}`,
  INVITE: (token: string) => `/invite/${encodeURIComponent(token)}`,
} as const satisfies Record<string, `/${string}` | ((...args: never[]) => string)>;

/** 같은 origin의 `/backend/*` 프록시(next.config rewrites)로 부르는 API 경로 */
export const BACKEND_ROUTES = {
  GRAPHQL: '/backend/graphql',
  AUTH_CONFIG: '/backend/auth/config',
  AUTH_LOGOUT: '/backend/auth/logout',
  AUTH_APP_EXCHANGE: '/backend/auth/app/exchange',
  AUTH_PROVIDER: (provider: 'google' | 'kakao') => `/backend/auth/${provider}`,
  PUSH_DEVICE_REGISTER: '/backend/push/devices/register',
  PUSH_DEVICE_UNREGISTER: '/backend/push/devices/unregister',
} as const satisfies Record<string, `/backend/${string}` | ((...args: never[]) => string)>;

/** 익명 또는 회원 세션이 필요한 화면. proxy.ts matcher와 같은 목록이다. */
export const SESSION_PATH_PREFIXES = [
  '/groups/',
  '/invite/',
  '/contests/',
] as const satisfies readonly `/${string}/`[];
export const SESSION_PATHS = [
  '/',
  '/explore',
  '/groups',
  '/invite',
  '/contests',
  '/me',
  '/notifications',
  '/onboarding',
] as const satisfies readonly `/${string}`[];
