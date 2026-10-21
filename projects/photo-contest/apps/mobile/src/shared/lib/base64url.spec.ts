import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { encodeBase64Url } from './base64url';

function bytesOf(text: string) {
  return new TextEncoder().encode(text);
}

describe('encodeBase64Url', () => {
  it('RFC 4648 테스트 벡터를 패딩 없이 인코딩해야 한다', () => {
    expect(encodeBase64Url(bytesOf(''))).toBe('');
    expect(encodeBase64Url(bytesOf('f'))).toBe('Zg');
    expect(encodeBase64Url(bytesOf('fo'))).toBe('Zm8');
    expect(encodeBase64Url(bytesOf('foo'))).toBe('Zm9v');
    expect(encodeBase64Url(bytesOf('foob'))).toBe('Zm9vYg');
    expect(encodeBase64Url(bytesOf('fooba'))).toBe('Zm9vYmE');
    expect(encodeBase64Url(bytesOf('foobar'))).toBe('Zm9vYmFy');
  });

  it('+와 / 대신 -와 _를 써야 한다', () => {
    expect(encodeBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(encodeBase64Url(new Uint8Array([0xff, 0xff, 0xff]))).toBe('____');
  });

  it('RFC 7636 부록 B의 PKCE verifier와 challenge를 만들어야 한다', () => {
    const verifierBytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214,
      191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
    ]);
    const verifier = encodeBase64Url(verifierBytes);

    expect(verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(encodeBase64Url(createHash('sha256').update(verifier).digest())).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('임의 바이트에서 Node의 base64url과 같은 결과를 내야 한다', () => {
    for (let length = 0; length < 70; length += 1) {
      const bytes = randomBytes(length);
      expect(encodeBase64Url(bytes)).toBe(bytes.toString('base64url'));
    }
  });
});
