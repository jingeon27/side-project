import { GraphQLError } from 'graphql';
import { match } from 'ts-pattern';

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
  ALREADY_DONE: '이미 처리된 요청입니다.',
  ALREADY_VOTED: '이미 이 대회에 투표했습니다.',
  ANONYMOUS_VOTE_FORBIDDEN:
    '익명 계정은 대회에 투표할 수 없어요. 회원으로 가입하거나 로그인한 뒤 투표해 주세요.',
  ALREADY_SUBMITTED: '이미 이 대회에 사진을 제출했습니다.',
  UPLOAD_ALREADY_USED: '이미 다른 곳에 사용한 업로드입니다. 파일을 다시 올려 주세요.',
  FORBIDDEN_ORIGIN: '허용되지 않은 요청 출처입니다.',
  INTERNAL: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
} as const satisfies Record<string, string>;

export function fail(message: string, code: TErrorCode = ERROR_CODE.BAD_USER_INPUT): never {
  throw new GraphQLError(message, { extensions: { code } });
}

export function isErrorCode(code: unknown): code is TErrorCode {
  return typeof code === 'string' && Object.hasOwn(ERROR_CODE, code);
}

/** HTTP 엔드포인트에서 GraphQL 오류 code를 상태 코드로 바꾼다. 우리 code가 아니면 400. */
export function httpStatusOf(code: unknown): number {
  if (!isErrorCode(code)) return 400;
  return match(code)
    .with(ERROR_CODE.BAD_USER_INPUT, () => 400)
    .with(ERROR_CODE.UNAUTHENTICATED, () => 401)
    .with(ERROR_CODE.FORBIDDEN, () => 403)
    .with(ERROR_CODE.NOT_FOUND, () => 404)
    .with(ERROR_CODE.CONFLICT, () => 409)
    .with(ERROR_CODE.RATE_LIMITED, () => 429)
    .with(ERROR_CODE.INTERNAL_SERVER_ERROR, () => 500)
    .with(ERROR_CODE.UNAVAILABLE, () => 503)
    .exhaustive();
}
