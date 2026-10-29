import type { Request, Response } from 'express';

export const COOKIE = 'gamefeedback_session';
export function cookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.cookie ?? '')
      .split(';')
      .map((v) => v.trim().split('='))
      .filter((v) => v.length === 2),
  );
}
export function setCookie(res: Response, name: string, value: string, maxAge: number, production: boolean) {
  res.cookie(name, value, { httpOnly: true, sameSite: 'lax', secure: production, path: '/', maxAge });
}
