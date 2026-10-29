import { COOKIE, cookies } from '../../common/http/cookies';
import type { SessionRequest } from './session.types';

export function sessionToken(req: SessionRequest) {
  const authorization = req.headers.authorization;
  if (authorization !== undefined) return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(authorization)?.[1] ?? null;
  return cookies(req)[COOKIE] ?? null;
}
