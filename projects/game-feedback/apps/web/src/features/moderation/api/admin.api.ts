import {
  getAdminUser,
  listReports,
  reviewReport,
  setUserBan,
  setUserVerification,
  hideContent,
} from '@game-feedback/sdk';
import { withApiError } from '@/shared/api';
export const fetchReports = () => withApiError(listReports());
export const fetchAdminUser = (id: string) => withApiError(getAdminUser(id));
export const patchReport = ({ id, status }: { id: string; status: 'REVIEWED' | 'DISMISSED' }) =>
  withApiError(reviewReport(id, { status }));
export const patchUserBan = ({ id, banned, reason }: { id: string; banned: boolean; reason: string }) =>
  withApiError(setUserBan(id, { banned, reason }));
export const patchVerification = ({ id, isVerified }: { id: string; isVerified: boolean }) =>
  withApiError(setUserVerification(id, { isVerified }));
export const patchVisibility = (input: Parameters<typeof hideContent>[0]) => withApiError(hideContent(input));
export type TAdminReport = Awaited<ReturnType<typeof fetchReports>>[number];
