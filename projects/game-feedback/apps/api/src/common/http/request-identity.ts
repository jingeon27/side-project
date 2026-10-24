import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';

export function requestIdentity(req: Request, secret?: string) {
  const supplied = req.get('x-game-feedback-proxy-secret');
  const trusted = Boolean(
    secret &&
    supplied &&
    Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(supplied)),
  );
  const forwarded = req.get('x-game-feedback-client-ip');
  if (trusted && forwarded && isIP(forwarded)) return { ip: forwarded, publicSsr: false };
  // 서버의 공개 캐시 채우기만 방문자 IP를 생략하고 별도의 유한 조회 예산을 쓴다.
  // 외부 요청의 전달 헤더는 Caddy가 실제 연결 IP로 덮어쓴다.
  if (trusted && forwarded === undefined && ['GET', 'HEAD'].includes(req.method))
    return { ip: 'public-ssr', publicSsr: true };
  return { ip: req.socket.remoteAddress ?? 'unknown', publicSsr: false };
}
