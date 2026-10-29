import { z } from 'zod';

import { ApiError } from './api-error';
import { applyResponseFallbacks } from './response/fallback-policy';
import { ApiResponseValidationError } from './response/validation-error';

export { ApiError } from './api-error';

const errorPayloadSchema = z
  .object({
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,99}$/)
      .catch('REQUEST_FAILED'),
    message: z.string().trim().min(1).max(500).catch('요청을 처리하지 못했습니다.'),
  })
  .catch({ errorCode: 'REQUEST_FAILED', message: '요청을 처리하지 못했습니다.' });
interface IApiFetchOptions<T> extends RequestInit {
  schema?: z.ZodType<T>;
  baseUrl?: string;
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
// 생성 URL은 경로 파라미터를 인코딩한다(orval `urlEncodeParameters`). 인코딩된 값이 프록시·rewrite에서
// 다시 풀려도 경로를 바꾸지 못하게 빈·점 세그먼트와 `/`·`\`·`?`·`#`가 든 세그먼트를 보내지 않는다.
function isSafeRequestPath(url: string) {
  const [path = ''] = url.split('?', 1);
  if (!path.startsWith('/')) return false;
  return path
    .slice(1)
    .split('/')
    .every((segment) => {
      const value = decodeSegment(segment);
      return value !== null && value !== '' && value !== '.' && value !== '..' && !/[/\\?#]/.test(value);
    });
}

export async function apiFetch<T>(url: string, options: IApiFetchOptions<T> = {}): Promise<T> {
  const { schema, baseUrl, ...requestOptions } = options;
  if (!schema) throw new ApiError(0, 'RESPONSE_SCHEMA_REQUIRED', '응답 검증 스키마가 필요합니다.');
  if (!isSafeRequestPath(url))
    throw new ApiError(0, 'INVALID_REQUEST_PATH', '요청 경로가 올바르지 않습니다.');
  const headers = new Headers(requestOptions.headers);
  if (typeof FormData !== 'undefined' && requestOptions.body instanceof FormData)
    headers.delete('Content-Type');
  if (typeof requestOptions.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const response = await fetch(baseUrl ? new URL(url, baseUrl).toString() : url, {
    ...requestOptions,
    credentials: 'include',
    cache: 'no-store',
    headers,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (response.ok) throw new ApiResponseValidationError(response.status);
    payload = null;
  }
  if (!response.ok) {
    const error = errorPayloadSchema.parse(payload);
    throw new ApiError(response.status, error.errorCode, error.message);
  }
  const result = schema.safeParse(applyResponseFallbacks(schema, payload));
  if (!result.success) throw new ApiResponseValidationError(response.status, result.error.issues);
  return result.data;
}
