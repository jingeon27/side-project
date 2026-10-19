import {
  exchangeAppLogin,
  getSession,
  demoLogin,
  onboard,
  logout,
  deleteAccount,
  listTestAccounts,
  testAccountLogin,
} from '@game-feedback/sdk';
import { withApiError, type Session, type TestAccountList } from '@/shared/api';
import type { TDemoLoginInput, TOnboardInput, TTestLoginInput } from '../types/auth.type';

export function fetchSession({ signal }: { signal?: AbortSignal } = {}): Promise<Session> {
  return withApiError(getSession({ signal }));
}
export function postDemoLogin(body: TDemoLoginInput): Promise<Session> {
  return withApiError(demoLogin(body));
}
export function postOnboarding(body: TOnboardInput): Promise<Session> {
  return withApiError(onboard(body));
}
export function postTestLogin(body: TTestLoginInput): Promise<Session> {
  return withApiError(testAccountLogin(body));
}
export function postLogout() {
  return withApiError(logout());
}
export function deleteMembership() {
  return withApiError(deleteAccount());
}
export function fetchTestAccounts({ signal }: { signal?: AbortSignal } = {}): Promise<TestAccountList> {
  return withApiError(listTestAccounts({ signal }));
}

export function postAppExchange(body: { code: string; verifier: string }): Promise<Session> {
  return withApiError(exchangeAppLogin(body));
}
