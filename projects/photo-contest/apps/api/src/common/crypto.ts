import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;

/** URL에 그대로 넣을 수 있는 256비트 난수 */
export function randomToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** 세션·초대·업로드 토큰은 원문 대신 이 값만 저장한다. */
export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** RFC 7636 S256: base64url(SHA-256(verifier)) */
export function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** 길이가 달라도 같은 시간에 비교하도록 해시끼리 비교한다. */
export function safeEqual(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
