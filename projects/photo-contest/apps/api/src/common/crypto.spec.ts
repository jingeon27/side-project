import { describe, expect, it } from 'vitest';

import { pkceChallenge, randomToken, safeEqual, sha256Hex } from './crypto';

describe('암호 도구', () => {
  it('RFC 7636 부록 B의 verifier로 같은 S256 challenge를 만들어야 한다', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('토큰은 URL에 그대로 넣을 수 있는 43자이고 매번 달라야 한다', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('SHA-256 해시를 소문자 16진수로 돌려줘야 한다', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('같은 문자열만 같다고 판단하고 길이가 달라도 예외 없이 거짓이어야 한다', () => {
    expect(safeEqual('state-value', 'state-value')).toBe(true);
    expect(safeEqual('state-value', 'state-valuf')).toBe(false);
    expect(safeEqual('short', 'a much longer value')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
