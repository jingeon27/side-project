import { getSession, issueTestToken, logout } from '@game-feedback/sdk';
import { operatorMode } from '@/shared/config';
export const fetchSession = () => getSession();
export const loginLocalAdmin = async () => {
  if (operatorMode) throw new Error('SSH에서 운영 관리자 세션을 발급해주세요.');
  await issueTestToken({ accountId: 'sample-test-admin' });
  return getSession();
};
export const endSession = async () => {
  await logout();
  return getSession();
};
