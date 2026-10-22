const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const SESSION_TTL_MS = 30 * DAY_MS;
export const OAUTH_ATTEMPT_TTL_MS = 10 * MINUTE_MS;
export const UPLOAD_TICKET_TTL_MS = 5 * MINUTE_MS;
export const APP_LOGIN_TICKET_TTL_MS = 2 * MINUTE_MS;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_JSON_BODY = '64kb';
export const MAX_PENDING_UPLOADS = 10;

export const PAGE_SIZE_DEFAULT = 24;
export const PAGE_SIZE_MAX = 48;
// 무한 스크롤 약 400쪽, 공개 사이트맵 약 200쪽(48개씩)까지 덮는다.
export const PAGE_OFFSET_MAX = 10_000;
export const GROUP_CONTEST_HISTORY = 50;
export const LEADERBOARD_LIMIT = 100;

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

// Cookie 헤더 상한. 같은 사이트의 다른 쿠키가 많아도 로그인이 풀리지 않게 RFC 6265 최소(4096)의 두 배로 두고,
// Node의 전체 요청 헤더 상한(16KB) 안에 머문다. 넘으면 조작된 요청으로 보고 비로그인으로 처리한다.
export const COOKIE_HEADER_MAX_LENGTH = 8 * 1024;
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
// 웹 문서 중 가장 큰 연산이 필드 약 50개(Apollo가 붙이는 __typename 포함 약 70개)이고 alias는 쓰지 않는다.
export const GRAPHQL_MAX_FIELDS = 300;
export const GRAPHQL_MAX_ALIASES = 10;
// 운영의 주소별 GraphQL 요청 수. 화면 하나가 SSR·브라우저를 합쳐 10번 안팎을 부르므로 분당 60화면을 넘는 양이다.
export const GRAPHQL_RATE_LIMIT_WINDOW_MS = MINUTE_MS;
export const GRAPHQL_RATE_LIMIT_PER_WINDOW = 600;

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const POST_TITLE_LIMIT = 80;
export const POST_BODY_LIMIT = 5000;
export const POST_LINK_LIMIT = 2048;
// 고정 경로가 매 요청 권한을 확인한 뒤 넘겨 주는 서명 GET의 수명. 공개 캐시에는 고정 경로만 남긴다.
export const MEDIA_URL_TTL_SECONDS = 60;
export const POST_UPLOAD_TTL_SECONDS = 15 * 60;
export const COMPLETED_POST_UPLOAD_TTL_MS = 60 * MINUTE_MS;
export const MEDIA_IO_TIMEOUT_MS = 10 * SECOND_MS;
export const COMMENT_BODY_LIMIT = 1000;

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
export const PASSWORD_KEY_BYTES = 64;
export const PASSWORD_SALT_BYTES = 16;
// scrypt 한 번이 32MB를 쓴다. libuv 기본 스레드 4개 중 절반만 쓰고 나머지 대기는 짧게 둔다.
export const PASSWORD_HASH_CONCURRENCY = 2;
export const PASSWORD_HASH_WAITING_LIMIT = 16;
export const AUTH_ATTEMPT_WINDOW_MS = 15 * MINUTE_MS;
export const AUTH_LOGIN_IP_LIMIT = 30;
export const AUTH_LOGIN_ID_LIMIT = 10;
export const AUTH_REGISTER_IP_LIMIT = 5;

export const GROUP_CATEGORY_LIMIT = 20;
export const GROUP_CATEGORY_NAME_LIMIT = 20;
export const GROUP_DESCRIPTION_LIMIT = 500;
export const CONTEST_LIKE_LIMIT_MAX = 100;
