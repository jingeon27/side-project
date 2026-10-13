import { z } from 'zod';

const VERSION = /^\d+\.\d+\.\d+$/;
/** 느린 네트워크에서 시작을 오래 붙잡지 않는다. 실패하면 버전 검사 없이 진행한다. */
const DEFAULT_TIMEOUT_MS = 5_000;

export const appConfigSchema = z.object({
  minimumVersion: z.string().regex(VERSION),
  latestVersion: z.string().regex(VERSION),
});
export type TAppConfig = z.output<typeof appConfigSchema>;

export const healthSchema = z.object({ status: z.enum(['ok', 'unavailable']) });
export type THealth = z.output<typeof healthSchema>;

/** 테스트에서 가짜 fetch를 넣고, 앱에서는 전역 fetch를 넣는다. */
export type TFetch = (input: string, init?: RequestInit) => Promise<Response>;

interface IRequestOptions {
  timeoutMs?: number;
}

async function requestJson(
  url: string,
  fetchImpl: TFetch,
  timeoutMs: number,
  isExpectedStatus: (status: number) => boolean,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!isExpectedStatus(response.status))
      throw new Error(`예상하지 못한 응답 상태입니다: ${response.status}`);
    const body: unknown = await response.json();
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** `GET {baseUrl}/app/config`. 앱 버전 강제 업데이트 기준. */
export async function fetchAppConfig(
  baseUrl: string,
  fetchImpl: TFetch,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: IRequestOptions = {},
): Promise<TAppConfig> {
  const body = await requestJson(`${baseUrl}/app/config`, fetchImpl, timeoutMs, (status) => status === 200);
  return appConfigSchema.parse(body);
}

/** `GET {baseUrl}/health`. DB가 내려가도 503과 `{"status":"unavailable"}`를 주므로 둘 다 읽는다. */
export async function fetchHealth(
  baseUrl: string,
  fetchImpl: TFetch,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: IRequestOptions = {},
): Promise<THealth> {
  const body = await requestJson(
    `${baseUrl}/health`,
    fetchImpl,
    timeoutMs,
    (status) => status === 200 || status === 503,
  );
  return healthSchema.parse(body);
}
