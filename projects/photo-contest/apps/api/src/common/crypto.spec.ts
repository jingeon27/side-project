import { describe, expect, it } from 'vitest';

import { randomToken, sha256Hex } from './crypto';

describe('암호 도구', () => {
  it('토큰은 URL에 그대로 넣을 수 있는 43자이고 매번 달라야 한다', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => randomToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('SHA-256 해시를 소문자 16진수로 돌려줘야 한다', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
