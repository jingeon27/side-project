import { z } from 'zod';

import { BACKEND_ROUTES } from '@/shared/constants/routes';
import { ensureOk } from '@/shared/model/error';

const authConfigSchema = z.object({
  developmentLogin: z.boolean(),
  google: z.boolean(),
  kakao: z.boolean(),
});

/** 서버에 켜져 있는 로그인 수단 */
export type TAuthConfig = z.output<typeof authConfigSchema>;

const postJson = (url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(ensureOk);

/** `GET /backend/auth/config` */
export async function fetchAuthConfig(): Promise<TAuthConfig> {
  const response = await ensureOk(await fetch(BACKEND_ROUTES.AUTH_CONFIG, { credentials: 'same-origin' }));
  return authConfigSchema.parse(await response.json());
}

/** 앱이 시스템 브라우저 로그인으로 받은 일회용 코드를 WebView 쿠키 세션으로 바꾼다. */
export async function exchangeAppLogin(payload: { code: string; verifier: string }) {
  await postJson(BACKEND_ROUTES.AUTH_APP_EXCHANGE, payload);
}

export async function requestLogout() {
  await postJson(BACKEND_ROUTES.AUTH_LOGOUT);
}
