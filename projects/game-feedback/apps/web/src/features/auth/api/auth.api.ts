import { deleteAccount, exchangeAppLogin, getSession, logout, onboard } from '@game-feedback/sdk';

import { withApiError, type Session } from '@/shared/api';

import type { TOnboardInput } from '../types/auth.type';

export function fetchSession({ signal }: { signal?: AbortSignal } = {}): Promise<Session> {
  return withApiError(getSession({ signal }));
}
export function postOnboarding(body: TOnboardInput): Promise<Session> {
  return withApiError(onboard(body));
}
export function postLogout() {
  return withApiError(logout());
}
export function deleteMembership() {
  return withApiError(deleteAccount());
}

export function postAppExchange(body: { code: string; verifier: string }): Promise<Session> {
  return withApiError(exchangeAppLogin(body));
}
