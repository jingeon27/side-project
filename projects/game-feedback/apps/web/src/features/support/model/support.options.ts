import { queryOptions, skipToken } from '@tanstack/react-query';
import { fetchSupportThreads } from '../api/support.api';
function supportThreadScope() {
  return queryOptions({ queryKey: ['support', 'threads'], queryFn: skipToken });
}
function createSupportThreadOptions(adminId: string) {
  return queryOptions({
    queryKey: [...supportThreadScope().queryKey, adminId],
    queryFn: fetchSupportThreads,
    refetchInterval: 15000,
  });
}
export function supportThreadOptions(adminId: string): ReturnType<typeof createSupportThreadOptions>;
export function supportThreadOptions(
  adminId?: string,
): ReturnType<typeof createSupportThreadOptions> | ReturnType<typeof supportThreadScope>;
export function supportThreadOptions(adminId?: string) {
  return adminId ? createSupportThreadOptions(adminId) : supportThreadScope();
}
