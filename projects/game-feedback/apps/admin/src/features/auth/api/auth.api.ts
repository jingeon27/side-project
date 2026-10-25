import { adminLogin, adminLogout, getAdminSession } from '@game-feedback/sdk';

export const fetchSession = () => getAdminSession();
export const loginAdmin = (input: Parameters<typeof adminLogin>[0]) => adminLogin(input);
export const endSession = async () => {
  await adminLogout();
  return getAdminSession();
};
