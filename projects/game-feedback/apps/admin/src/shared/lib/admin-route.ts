import { useSyncExternalStore } from 'react';
import { z } from 'zod';
const tabSchema = z.enum(['support', 'reports', 'users']).catch('support');
const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,100}$/)
  .catch('');
export function parseAdminRoute(hash: string) {
  const [tab, search] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(search);
  return {
    tab: tabSchema.parse(tab),
    userId: idSchema.parse(params.get('user')),
    threadId: idSchema.parse(params.get('thread')),
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
