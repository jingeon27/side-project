import type { TReportStatus } from '@game-feedback/contracts';
import {
  getAdminUser,
  hideContent,
  listReports,
  reviewReport,
  setUserBan,
  setUserVerification,
} from '@game-feedback/sdk';

export const fetchReports = (status: TReportStatus, cursor: string) =>
  listReports({ status, limit: 20, ...(cursor ? { cursor } : {}) });
export const fetchUser = (id: string) => getAdminUser(id);
export const updateVerification = ({ id, isVerified }: { id: string; isVerified: boolean }) =>
  setUserVerification(id, { isVerified });
export const updateBan = ({ id, banned, reason }: { id: string; banned: boolean; reason: string }) =>
  setUserBan(id, { banned, reason });
export const updateReport = ({ id, status }: { id: string; status: 'REVIEWED' | 'DISMISSED' }) =>
  reviewReport(id, { status });
export const updateVisibility = (input: Parameters<typeof hideContent>[0]) => hideContent(input);
export type TAdminReport = Awaited<ReturnType<typeof fetchReports>>['items'][number];
export type TAdminUser = Awaited<ReturnType<typeof fetchUser>>;
