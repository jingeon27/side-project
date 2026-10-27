const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const SESSION_TTL_MS = 30 * DAY_MS;
export const UPLOAD_TICKET_TTL_MS = 5 * MINUTE_MS;

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

export const MAINTENANCE_INTERVAL_MS = MINUTE_MS;
export const CLEANUP_BATCH_SIZE = 100;
export const SERIALIZABLE_ATTEMPTS = 4;
// Prisma 대화형 트랜잭션의 연결 대기·실행 한도. 기본값(2초·5초)을 명시해 긴 작업을 트랜잭션에 넣지 않게 한다.
export const TRANSACTION_MAX_WAIT_MS = 2 * SECOND_MS;
export const TRANSACTION_TIMEOUT_MS = 5 * SECOND_MS;
// 대회 시작·종료 알림은 멤버를 이만큼씩 나눠 각자의 짧은 트랜잭션에 쓴다.
export const NOTIFICATION_FANOUT_BATCH_SIZE = 250;
// 알림 쓰기에 실패한 대회는 1분부터 두 배씩, 최대 1시간까지 늦춰 다시 시도한다.
export const NOTIFICATION_RETRY_BASE_MS = MINUTE_MS;
export const NOTIFICATION_RETRY_MAX_MS = HOUR_MS;
export const GRAPHQL_MAX_DEPTH = 8;
// 웹 문서 중 가장 큰 연산이 필드 약 50개(Apollo가 붙이는 __typename 포함 약 70개)이고 alias는 쓰지 않는다.
export const GRAPHQL_MAX_FIELDS = 300;
export const GRAPHQL_MAX_ALIASES = 10;
// 운영의 주소별 GraphQL 요청 수. 화면 하나가 SSR·브라우저를 합쳐 10번 안팎을 부르므로 분당 60화면을 넘는 양이다.
export const GRAPHQL_RATE_LIMIT_WINDOW_MS = MINUTE_MS;
export const GRAPHQL_RATE_LIMIT_PER_WINDOW = 600;
// 운영의 주소별 고정 미디어 경로(게시물 파일·대회 사진·그룹/프로필 대표 사진) 요청 수. 요청마다 읽기 권한을 DB에서 확인한다.
// 피드 한 화면(48개)이 게시물·대표 사진을 합쳐 70번 안팎을 부르므로 분당 15화면을 넘는 양이다.
export const MEDIA_RATE_LIMIT_WINDOW_MS = MINUTE_MS;
export const MEDIA_RATE_LIMIT_PER_WINDOW = 1200;

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const POST_TITLE_LIMIT = 80;
export const POST_BODY_LIMIT = 5000;
export const POST_LINK_LIMIT = 2048;
// 고정 경로가 매 요청 권한을 확인한 뒤 넘겨 주는 서명 GET의 수명. 공개 캐시에는 고정 경로만 남긴다.
// 최대 100MB인 동영상은 느린 연결에서도 재생·탐색(Range)이 서명 만료로 끊기지 않게 10분으로 둔다.
export const MEDIA_URL_TTL_SECONDS = { PHOTO: 60, VIDEO: 10 * 60 } as const;
export const POST_UPLOAD_TTL_SECONDS = 15 * 60;
export const COMPLETED_POST_UPLOAD_TTL_MS = 60 * MINUTE_MS;
export const MEDIA_IO_TIMEOUT_MS = 10 * SECOND_MS;
export const COMMENT_BODY_LIMIT = 1000;

export const PASSWORD_MIN_LENGTH = 8;
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

// 운영의 쓰기 남용 제한. 보통 사용자는 닿지 않게 넉넉히 두고, 한 주소에서 여러 계정을 쓰는 경우는 사용자 한도의 3배까지 본다.
export const WRITE_RATE_LIMIT = {
  GROUP_CREATE: { windowMs: DAY_MS, perUser: 10, perAddress: 30 },
  POST_CREATE: { windowMs: HOUR_MS, perUser: 60, perAddress: 180 },
  COMMENT_CREATE: { windowMs: 10 * MINUTE_MS, perUser: 60, perAddress: 180 },
  JOIN_REQUEST: { windowMs: HOUR_MS, perUser: 30, perAddress: 90 },
  REPORT: { windowMs: HOUR_MS, perUser: 30, perAddress: 90 },
} as const;
// 사용자 한 명이 올린 원본(게시물·대회·대표 사진, 지우는 중인 파일 포함)의 합. 100MB 동영상 50개 분량이다.
export const USER_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
// 익명 계정은 IP당 15분 5개까지 바로 만들 수 있어 계정 하나의 몫을 작게 둔다. 100MB 동영상 5개 분량이다.
export const ANONYMOUS_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;
// 운영에서 주소 하나가 하루(UTC 고정 창) 동안 발급받을 수 있는 업로드 크기의 합. 계정을 바꿔 가며 버킷을 채우지 못하게 한다.
// 회원 두 명이 한도를 모두 채울 만큼 넉넉히 두며, DB에는 KiB 단위로 센다(RateLimitBucket.count는 Int).
export const UPLOAD_ADDRESS_BUDGET = { windowMs: DAY_MS, bytes: 10 * 1024 * 1024 * 1024 } as const;

export const GROUP_CATEGORY_LIMIT = 20;
export const GROUP_CATEGORY_NAME_LIMIT = 20;
export const GROUP_DESCRIPTION_LIMIT = 500;
export const CONTEST_LIKE_LIMIT_MAX = 100;

export const PUSH_DEVICE_LIMIT = 10;
export const PUSH_INTERVAL_MS = 15_000;
export const PUSH_QUEUE_BATCH_SIZE = 100;
