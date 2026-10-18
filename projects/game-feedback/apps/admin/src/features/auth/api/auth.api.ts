import { getSession, issueTestToken, logout } from '@game-feedback/sdk';
export const fetchSession = () => getSession();
export const loginLocalAdmin = async () => {
  await issueTestToken({ accountId: 'sample-test-admin' });
  return getSession();
};
export const endSession = async () => {
  await logout();
  return getSession();
};
