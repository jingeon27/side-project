import { CombinedGraphQLErrors, ServerError, ServerParseError } from '@apollo/client/errors';

import { BridgeError } from '@photo-contest/bridge/web';

/** API가 GraphQL extensions.code로 보내는 값 중 화면이 분기하는 것 */
export const ERROR_CODE = {
  BadUserInput: 'BAD_USER_INPUT',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  Unavailable: 'UNAVAILABLE',
  Internal: 'INTERNAL_SERVER_ERROR',
} as const satisfies Record<string, string>;
export type TErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export const DEFAULT_ERROR_MESSAGE = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
const NETWORK_ERROR_MESSAGE = '네트워크 연결을 확인하고 다시 시도해 주세요.';
const SERVER_ERROR_MESSAGE = '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';

const ERROR_CODES = new Set<string>(Object.values(ERROR_CODE));
const HTTP_STATUS_CODE: Record<number, TErrorCode> = {
  400: ERROR_CODE.BadUserInput,
  401: ERROR_CODE.Unauthenticated,
  403: ERROR_CODE.Forbidden,
  404: ERROR_CODE.NotFound,
  409: ERROR_CODE.Conflict,
  429: ERROR_CODE.RateLimited,
  503: ERROR_CODE.Unavailable,
};
// 브라우저마다 fetch 네트워크 실패 문구가 다르다 (Chrome, Safari, Firefox).
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror/i;

/** `/backend/*` REST 호출이 실패했을 때. message는 서버가 보낸 한국어 안내문이다. */
export class RequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

interface IErrorBody {
  message?: unknown;
  errors?: Array<{ message?: unknown; extensions?: { code?: unknown } }>;
}

function parseBody(text: string): IErrorBody | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as IErrorBody) : null;
  } catch {
    return null;
  }
}

async function readText(response: Response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function toErrorCode(value: unknown): TErrorCode | null {
  return typeof value === 'string' && ERROR_CODES.has(value) ? (value as TErrorCode) : null;
}

/** 실패한 REST 응답이면 서버 안내문으로 RequestError를 던진다. */
export async function ensureOk(response: Response) {
  if (response.ok) return response;
  const body = parseBody(await readText(response));
  const message =
    typeof body?.message === 'string' && response.status < 500 ? body.message : DEFAULT_ERROR_MESSAGE;
  throw new RequestError(message, response.status);
}

/** 화면이 분기할 오류 code. GraphQL extensions.code나 HTTP 상태에서 읽고, 모르면 null. */
export function getErrorCode(error: unknown): TErrorCode | null {
  if (CombinedGraphQLErrors.is(error)) return toErrorCode(error.errors[0]?.extensions?.code);
  if (ServerError.is(error))
    return (
      toErrorCode(parseBody(error.bodyText)?.errors?.[0]?.extensions?.code) ??
      HTTP_STATUS_CODE[error.statusCode] ??
      null
    );
  if (error instanceof RequestError) return HTTP_STATUS_CODE[error.status] ?? null;
  return null;
}

/**
 * 사용자에게 보여 줄 한국어 문장. API가 code와 함께 보낸 안내문은 그대로 쓰고,
 * 스키마 검증 오류나 예상하지 못한 오류는 기술적인 문장이 새지 않게 fallback으로 바꾼다.
 */
export function getErrorMessage(error: unknown, fallback: string = DEFAULT_ERROR_MESSAGE) {
  if (CombinedGraphQLErrors.is(error)) {
    const known = error.errors.find((item) => toErrorCode(item.extensions?.code));
    return known?.message ?? fallback;
  }
  if (ServerError.is(error)) {
    const body = parseBody(error.bodyText);
    const known = body?.errors?.find((item) => toErrorCode(item.extensions?.code));
    if (typeof known?.message === 'string') return known.message;
    if (error.statusCode >= 500) return SERVER_ERROR_MESSAGE;
    return typeof body?.message === 'string' ? body.message : fallback;
  }
  if (ServerParseError.is(error)) return SERVER_ERROR_MESSAGE;
  if (error instanceof RequestError || error instanceof BridgeError) return error.message;
  if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) return NETWORK_ERROR_MESSAGE;
  return fallback;
}
