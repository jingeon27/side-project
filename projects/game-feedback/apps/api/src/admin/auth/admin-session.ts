import type { Response } from 'express';

export const ADMIN_COOKIE = 'gamefeedback_admin_session';
export const ADMIN_SESSION_MS = 60 * 60 * 1000;
// Admin is reached through a loopback Vite proxy/SSH tunnel, including in production.
export function setAdminCookie(res: Response, value: string, maxAge: number) {
  res.cookie(ADMIN_COOKIE, value, { httpOnly: true, sameSite: 'strict', path: '/api/admin', maxAge });
}
export function isAdminPath(path: string) {
  return path === '/api/admin' || path.startsWith('/api/admin/');
}
