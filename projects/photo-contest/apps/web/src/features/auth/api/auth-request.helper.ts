import { BACKEND_ROUTES } from '@/shared/constants/routes';
import { ensureOk } from '@/shared/model/error';

const postJson = async (url: string, body?: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return ensureOk(response);
};

export async function requestLogout() {
  await postJson(BACKEND_ROUTES.AUTH_LOGOUT);
}
