import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { postUploadPolicy } from '../post/post-upload.policy';

// 로컬 프로세스를 재시작하면 이전 개발용 업로드 주소도 만료된다.
const secret = randomBytes(32);
const grantSchema = z.object({
  key: z.string().regex(/^staging\/[a-f0-9-]{36}$/),
  contentType: z.string(),
  byteSize: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});
export type TLocalUploadGrant = z.infer<typeof grantSchema>;

function signature(payload: string) {
  return createHmac('sha256', secret).update(payload).digest();
}
export function createLocalUploadGrant(grant: TLocalUploadGrant) {
  const payload = Buffer.from(JSON.stringify(grant)).toString('base64url');
  return {
    url: `/backend/local-post-uploads?grant=${payload}&signature=${signature(payload).toString('base64url')}`,
    fields: { key: grant.key, 'Content-Type': grant.contentType },
  };
}
export function verifyLocalUploadGrant(payload: unknown, signed: unknown): TLocalUploadGrant | null {
  if (
    typeof payload !== 'string' ||
    payload.length > 1024 ||
    typeof signed !== 'string' ||
    signed.length !== 43
  )
    return null;
  const actual = Buffer.from(signed, 'base64url');
  const expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const grant = grantSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    if (grant.expiresAt <= Date.now()) return null;
    postUploadPolicy(grant.contentType, grant.byteSize);
    return grant;
  } catch {
    return null;
  }
}
