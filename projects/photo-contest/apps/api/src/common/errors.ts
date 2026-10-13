import { GraphQLError } from 'graphql';

export const ERROR_CODE = {
  BAD_USER_INPUT: 'BAD_USER_INPUT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type TErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

/** 여러 모듈이 같은 문장을 쓰는 오류. 웹·앱이 문장으로 분기하지 않도록 code와 함께 쓴다. */
export const ERROR_MESSAGE = {
  LOGIN_REQUIRED: '먼저 로그인해 주세요.',
  GROUP_FORBIDDEN: '이 그룹에 접근할 권한이 없습니다.',
  CONTEST_NOT_FOUND: '대회를 찾을 수 없습니다.',
  SUBMISSION_NOT_FOUND: '사진을 찾을 수 없습니다.',
  INVALID_INVITE: '유효하지 않은 초대 링크입니다.',
  NOT_SUBMISSION_PHASE: '사진 제출 기간이 아닙니다.',
  REQUEST_CONFLICT: '요청이 겹쳤습니다. 다시 시도해 주세요.',
  ALREADY_DONE: '이미 제출하거나 투표했습니다.',
  APP_LOGIN_REJECTED: '앱 로그인 요청을 확인할 수 없습니다.',
  FORBIDDEN_ORIGIN: '허용되지 않은 요청 출처입니다.',
  INTERNAL: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
} as const;

const HTTP_STATUS: Record<string, number> = {
  [ERROR_CODE.UNAUTHENTICATED]: 401,
  [ERROR_CODE.FORBIDDEN]: 403,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.CONFLICT]: 409,
  [ERROR_CODE.RATE_LIMITED]: 429,
  [ERROR_CODE.UNAVAILABLE]: 503,
};

export function fail(message: string, code: TErrorCode = ERROR_CODE.BAD_USER_INPUT): never {
  throw new GraphQLError(message, { extensions: { code } });
}

/** HTTP 엔드포인트에서 GraphQL 오류 code를 상태 코드로 바꾼다. 나머지는 400. */
export function httpStatusOf(code: unknown) {
  return (typeof code === 'string' ? HTTP_STATUS[code] : undefined) ?? 400;
}
