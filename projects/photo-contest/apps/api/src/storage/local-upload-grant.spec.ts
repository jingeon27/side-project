import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLocalUploadGrant, verifyLocalUploadGrant } from './local-upload-grant';

describe('로컬 업로드 서명', () => {
  it('서명한 키·크기·타입·만료만 허용하고 변조와 만료는 거절해야 한다', () => {
    const input = {
      key: `staging/${randomUUID()}`,
      contentType: 'image/png',
      byteSize: 40,
      expiresAt: Date.now() + 60_000,
    };
    const form = createLocalUploadGrant(input);
    const url = new URL(form.url, 'http://local.test');
    const grant = url.searchParams.get('grant');
    const signature = url.searchParams.get('signature');
    expect(verifyLocalUploadGrant(grant, signature)).toEqual(input);
    expect(
      verifyLocalUploadGrant(
        Buffer.from(JSON.stringify({ ...input, byteSize: 1000 })).toString('base64url'),
        signature,
      ),
    ).toBeNull();
    const expired = new URL(createLocalUploadGrant({ ...input, expiresAt: 1 }).url, url.origin);
    expect(
      verifyLocalUploadGrant(expired.searchParams.get('grant'), expired.searchParams.get('signature')),
    ).toBeNull();
    expect(verifyLocalUploadGrant(grant, 'bad')).toBeNull();
  });
});
