import { useSyncExternalStore } from 'react';

import { omit } from 'es-toolkit';
import qs from 'qs';
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
  const [tab, search = ''] = hash.replace(/^#/, '').split('?');
  const params = qs.parse(search, {
    ignoreQueryPrefix: true,
    depth: 0,
    parseArrays: false,
    duplicates: 'first',
  });
  return {
    tab: tabSchema.parse(tab),
    userId: idSchema.parse(params.user),
    threadId: idSchema.parse(params.thread),
    reportStatus: reportStatusSchema.parse(params.status),
    supportStatus: supportStatusSchema.parse(params.status),
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
  return `#users${qs.stringify({ user: idSchema.parse(id) }, { addQueryPrefix: true })}`;
}
export function adminReportsPath(status: TReportStatus) {
  return `#reports${qs.stringify({ status: reportStatusSchema.parse(status) }, { addQueryPrefix: true })}`;
}
export function adminSupportPath(id: string, status: TSupportStatusFilter = 'ALL') {
  const filter = supportStatusSchema.parse(status);
  const query = { thread: idSchema.parse(id), status: filter === 'ALL' ? undefined : filter };
  return `#support${qs.stringify(query, { addQueryPrefix: true })}`;
}
export function adminSupportListPath(status: TSupportStatusFilter, currentHash = '#support') {
  const filter = supportStatusSchema.parse(status);
  // 쓰기는 status만 바꾸고 다른 키와 중복 키를 보존한다.
  const current = qs.parse(currentHash.split('?').slice(1).join('?'), {
    ignoreQueryPrefix: true,
    depth: 0,
    parseArrays: false,
    duplicates: 'combine',
    arrayLimit: Infinity,
    parameterLimit: Infinity,
  });
  const query = { ...omit(current, ['status']), status: filter === 'ALL' ? undefined : filter };
  return `#support${qs.stringify(query, { addQueryPrefix: true, arrayFormat: 'repeat' })}`;
}
