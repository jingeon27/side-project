const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const SESSION_TTL_MS = 30 * DAY_MS;
export const OAUTH_ATTEMPT_TTL_MS = 10 * MINUTE_MS;
export const UPLOAD_TICKET_TTL_MS = 5 * MINUTE_MS;
export const APP_LOGIN_TICKET_TTL_MS = 2 * MINUTE_MS;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BODY = '10mb';
export const MAX_JSON_BODY = '64kb';
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_IMAGE_EDGE_PX = 1600;
export const WEBP_QUALITY = 82;
export const MAX_PENDING_UPLOADS = 10;

export const PAGE_SIZE_DEFAULT = 24;
export const PAGE_SIZE_MAX = 48;
export const GROUP_CONTEST_HISTORY = 50;

export const CONTEST_MAX_DURATION_MS = 90 * DAY_MS;
// 폼 입력과 요청 사이의 지연 때문에 막 지난 시작 시각은 허용한다.
export const CONTEST_START_GRACE_MS = MINUTE_MS;

export const TEXT_LIMIT = {
  NICKNAME: 24,
  GROUP_NAME: 40,
  INVITE_TOKEN: 100,
  CONTEST_TITLE: 80,
  CAPTION: 160,
  REPORT_REASON: 500,
} as const;

// 브라우저가 보내는 Cookie 헤더 상한(RFC 6265 권장 최소 4096바이트). 넘으면 조작된 요청으로 본다.
export const COOKIE_HEADER_MAX_LENGTH = 4096;
// RFC 7636: verifier는 43~128자, S256 challenge는 base64url 43자
export const PKCE_VERIFIER_MIN_LENGTH = 43;
export const PKCE_VERIFIER_MAX_LENGTH = 128;
export const PKCE_CHALLENGE_LENGTH = 43;
export const APP_LOGIN_CODE_MAX_LENGTH = 256;

export const MAINTENANCE_INTERVAL_MS = MINUTE_MS;
export const CLEANUP_BATCH_SIZE = 100;
export const OAUTH_PROVIDER_TIMEOUT_MS = 10 * SECOND_MS;
export const SERIALIZABLE_ATTEMPTS = 4;
export const GRAPHQL_MAX_DEPTH = 8;
