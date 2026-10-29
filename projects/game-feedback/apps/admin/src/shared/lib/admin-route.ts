import { useSyncExternalStore } from 'react';

import { z } from 'zod';

import { ReportStatusSchema, SupportStatusSchema, type TReportStatus } from '@game-feedback/contracts';

const tabSchema = z.enum(['support', 'reports', 'users']).catch('support');
export type TAdminTab = z.output<typeof tabSchema>;
const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,100}$/)
  .catch('');
const reportStatusSchema = ReportStatusSchema.catch('OPEN');
// 문의함은 기본으로 모든 상태를 보인다.
const supportStatusSchema = z.enum(['ALL', ...SupportStatusSchema.options]).catch('ALL');
export type TSupportStatusFilter = z.output<typeof supportStatusSchema>;
export function parseAdminRoute(hash: string) {
  const [tab, search] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(search);
  return {
    tab: tabSchema.parse(tab),
    userId: idSchema.parse(params.get('user')),
    threadId: idSchema.parse(params.get('thread')),
    reportStatus: reportStatusSchema.parse(params.get('status')),
    supportStatus: supportStatusSchema.parse(params.get('status')),
  };
}
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};
export function useAdminRoute() {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return { ...parseAdminRoute(hash), hash };
}
export function adminUserPath(id: string) {
  return `#users?user=${encodeURIComponent(idSchema.parse(id))}`;
}
export function adminReportsPath(status: TReportStatus) {
  return `#reports?status=${reportStatusSchema.parse(status)}`;
}
export function adminSupportPath(id: string, status: TSupportStatusFilter = 'ALL') {
  const filter = supportStatusSchema.parse(status);
  return `#support?thread=${encodeURIComponent(idSchema.parse(id))}${filter === 'ALL' ? '' : `&status=${filter}`}`;
}
export function adminSupportListPath(status: TSupportStatusFilter, currentHash = '#support') {
  const filter = supportStatusSchema.parse(status);
  const params = new URLSearchParams(currentHash.split('?').slice(1).join('?'));
  params.delete('status');
  if (filter !== 'ALL') params.set('status', filter);
  const search = params.toString();
  return `#support${search ? `?${search}` : ''}`;
}
