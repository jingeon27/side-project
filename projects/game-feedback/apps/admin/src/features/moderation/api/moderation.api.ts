import {
  getAdminUser,
  setUserVerification,
  setUserBan,
  listReports,
  reviewReport,
  hideContent,
} from '@game-feedback/sdk';
export const fetchReports = () => listReports();
export const fetchUser = (id: string) => getAdminUser(id);
export const updateVerification = ({ id, isVerified }: { id: string; isVerified: boolean }) =>
  setUserVerification(id, { isVerified });
export const updateBan = ({ id, banned, reason }: { id: string; banned: boolean; reason: string }) =>
  setUserBan(id, { banned, reason });
export const updateReport = ({ id, status }: { id: string; status: 'REVIEWED' | 'DISMISSED' }) =>
  reviewReport(id, { status });
export const updateVisibility = (input: Parameters<typeof hideContent>[0]) => hideContent(input);
export type TAdminReport = Awaited<ReturnType<typeof fetchReports>>[number];
export type TAdminUser = Awaited<ReturnType<typeof fetchUser>>;
