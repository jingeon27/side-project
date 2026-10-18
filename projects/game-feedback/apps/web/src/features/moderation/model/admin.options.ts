import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchAdminUser, fetchReports } from '../api/admin.api';
function adminReportScope() {
  return queryOptions({ queryKey: ['moderation', 'reports'], queryFn: skipToken });
}
function createAdminReportOptions(adminId: string) {
  return queryOptions({ queryKey: [...adminReportScope().queryKey, adminId], queryFn: fetchReports });
}
export function adminReportOptions(adminId: string): ReturnType<typeof createAdminReportOptions>;
export function adminReportOptions(
  adminId?: string,
): ReturnType<typeof createAdminReportOptions> | ReturnType<typeof adminReportScope>;
export function adminReportOptions(adminId?: string) {
  return adminId ? createAdminReportOptions(adminId) : adminReportScope();
}
function adminUserScope(adminId?: string) {
  return queryOptions({ queryKey: compact(['moderation', 'users', adminId]), queryFn: skipToken });
}
function createAdminUserOptions(adminId: string, id: string) {
  return queryOptions({
    queryKey: [...adminUserScope(adminId).queryKey, id],
    queryFn: () => fetchAdminUser(id),
  });
}
export function adminUserOptions(adminId: string, id: string): ReturnType<typeof createAdminUserOptions>;
export function adminUserOptions(
  adminId?: string,
  id?: string,
): ReturnType<typeof createAdminUserOptions> | ReturnType<typeof adminUserScope>;
export function adminUserOptions(adminId?: string, id?: string) {
  return adminId && id ? createAdminUserOptions(adminId, id) : adminUserScope(adminId);
}
