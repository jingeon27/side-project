import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** URL에 그대로 넣을 수 있는 256비트 난수 */
export function randomToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** 세션·초대·업로드 토큰은 원문 대신 이 값만 저장한다. */
export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
