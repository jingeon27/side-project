import { useSyncExternalStore } from 'react';

import { z } from 'zod';

import { ReportStatusSchema, type TReportStatus } from '@game-feedback/contracts';

const tabSchema = z.enum(['support', 'reports', 'users']).catch('support');
export type TAdminTab = z.output<typeof tabSchema>;
const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,100}$/)
  .catch('');
const reportStatusSchema = ReportStatusSchema.catch('OPEN');
export function parseAdminRoute(hash: string) {
  const [tab, search] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(search);
  return {
    tab: tabSchema.parse(tab),
    userId: idSchema.parse(params.get('user')),
    threadId: idSchema.parse(params.get('thread')),
    reportStatus: reportStatusSchema.parse(params.get('status')),
  };
}
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};
export function useAdminRoute() {
  return parseAdminRoute(
    useSyncExternalStore(
      subscribe,
      () => window.location.hash,
      () => '',
    ),
  );
}
export function adminUserPath(id: string) {
  return `#users?user=${encodeURIComponent(idSchema.parse(id))}`;
}
export function adminReportsPath(status: TReportStatus) {
  return `#reports?status=${reportStatusSchema.parse(status)}`;
}
export function adminSupportPath(id: string) {
  return `#support?thread=${encodeURIComponent(idSchema.parse(id))}`;
}
