import { adminLogin, adminLogout, ApiError, getAdminSession } from '@game-feedback/sdk';

export const fetchSession = () => getAdminSession();
export const loginAdmin = (input: Parameters<typeof adminLogin>[0]) => adminLogin(input);
export const endSession = async () => {
  await adminLogout();
  return getAdminSession();
};
/** 관리자 세션이 없거나 끝나 API가 거절한 요청이다. 잘못된 로그인 정보(INVALID_ADMIN_CREDENTIALS)는 포함하지 않는다. */
export const isAuthRequired = (error: unknown) =>
  error instanceof ApiError && error.errorCode === 'AUTH_REQUIRED';
