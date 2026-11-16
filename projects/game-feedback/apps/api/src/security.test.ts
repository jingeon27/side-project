import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import {
  DemoInputSchema,
  isReservedNickname,
  NewNicknameSchema,
  OnboardInputSchema,
  PostInputSchema,
  UpdateProfileInputSchema,
} from '@game-feedback/contracts';

import {
  assertDatabaseUrl,
  assertOrigin,
  decodeCursor,
  DemoProfileProvider,
  encodeCursor,
  GoogleIdentityProvider,
  hash,
} from './security';

const db = 'postgresql://game_feedback:secret@127.0.0.1:55442/game_feedback?schema=public';
describe('database isolation', () => {
  it('accepts only the dedicated database and restricted user', () => {
    expect(assertDatabaseUrl(db, 'development')).toBe(db);
    expect(() =>
      assertDatabaseUrl(db.replace('/game_feedback?', '/photo_contest?'), 'development'),
    ).toThrow();
    expect(() =>
      assertDatabaseUrl(db.replace('game_feedback:secret', 'postgres:secret'), 'development'),
    ).toThrow();
  });
  it('requires a separate test database and gf_test_ schema', () => {
    expect(() => assertDatabaseUrl(db, 'test')).toThrow();
    expect(() => assertDatabaseUrl(db.replace('/game_feedback?', '/game_feedback_test?'), 'test')).toThrow();
    expect(
      assertDatabaseUrl(
        db
          .replace(':55442/', ':55444/')
          .replace('/game_feedback?schema=public', '/game_feedback_test?schema=gf_test_unit'),
        'test',
      ),
    ).toContain('gf_test_unit');
  });
});
describe('cookie request origin', () => {
  it('rejects foreign and absent origins', () => {
    for (const headers of [
      { origin: 'https://evil.example' },
      {},
      { origin: 'http://localhost:3300', 'sec-fetch-site': 'cross-site' },
    ])
      expect(() => assertOrigin({ headers } as Request, 'http://localhost:3300')).toThrow();
    expect(() =>
      assertOrigin({ headers: { origin: 'http://localhost:3300' } } as Request, 'http://localhost:3300'),
    ).not.toThrow();
  });
});
describe('cursor and request validation', () => {
  it('round trips cursor timestamp and id without lossy ordering', () => {
    const row = { id: 'request-x', createdAt: new Date('2026-10-16T00:00:00.000Z') };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });
  it('rejects malformed pagination cursors', () => {
    for (const value of ['not-json', Buffer.from('["bad",2]').toString('base64url')])
      expect(() => decodeCursor(value)).toThrow();
  });
  it('requires both consent and age policy confirmation', () => {
    expect(
      OnboardInputSchema.safeParse({ nickname: '테스터', acceptedTerms: true, ageConfirmed: false }).success,
    ).toBe(false);
    expect(
      OnboardInputSchema.safeParse({ nickname: '테스터', acceptedTerms: false, ageConfirmed: true }).success,
    ).toBe(false);
    expect(
      OnboardInputSchema.safeParse({ nickname: '테스터', acceptedTerms: true, ageConfirmed: true }).success,
    ).toBe(true);
  });
  it('rejects client supplied author and moderation fields', () =>
    expect(
      PostInputSchema.safeParse({
        title: 'A valid title',
        body: 'A sufficiently descriptive body for feedback',
        categoryId: 'clash-royale',
        authorId: 'victim',
      }).success,
    ).toBe(false));
  it('rejects a new nickname that reads as the support account, an admin or a withdrawn user', () => {
    const impersonations = [
      '운영자',
      '운 영 자',
      // 한글 채움 문자(U+3164)는 글자로 분류돼 형식 검사를 통과하지만 화면에는 보이지 않는다.
      `운${String.fromCodePoint(0x3164)}영자`,
      '관리자',
      '운영팀',
      'ADMIN',
      'Ａｄｍｉｎ',
      'Administrator',
      '탈퇴한 사용자',
      '탈퇴한_사용자',
    ];
    for (const nickname of impersonations) {
      expect(isReservedNickname(nickname), nickname).toBe(true);
      expect(NewNicknameSchema.safeParse(nickname).success, nickname).toBe(false);
      expect(DemoInputSchema.safeParse({ nickname }).success, nickname).toBe(false);
      expect(
        OnboardInputSchema.safeParse({ nickname, acceptedTerms: true, ageConfirmed: true }).success,
        nickname,
      ).toBe(false);
      // 프로필 저장은 지금 닉네임을 늘 함께 보내므로 형식만 본다. 바뀐 닉네임은 ProfileService가 거부한다.
      expect(UpdateProfileInputSchema.safeParse({ nickname, bio: '' }).success, nickname).toBe(true);
    }
  });
  it('matches whole names only, so names that merely contain a reserved word stay usable', () => {
    for (const nickname of ['badminton', '운영테스터', '카테고리관리자', '관리자테스트', '운영자 지정 전']) {
      expect(isReservedNickname(nickname), nickname).toBe(false);
      expect(NewNicknameSchema.safeParse(nickname).success, nickname).toBe(true);
      expect(UpdateProfileInputSchema.safeParse({ nickname, bio: '' }).success, nickname).toBe(true);
    }
  });
});
describe('external adapter boundaries', () => {
  it('requests only openid and enables PKCE plus nonce', () => {
    const provider = new GoogleIdentityProvider(
      'client',
      'secret',
      'http://localhost:3300/api/auth/google/callback',
    );
    const url = new URL(
      provider.authorizationUrl({ state: 'state', nonce: 'nonce', challenge: 'challenge' }),
    );
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('nonce')).toBe('nonce');
  });
  it('marks sample profiles unverified and DEMO', async () => {
    const p = await new DemoProfileProvider().lookup('#GG829JGY');
    expect(p.source).toBe('DEMO');
    expect(p.verification).toBe('UNVERIFIED');
    expect(p.deck).toHaveLength(8);
  });
  it('stores token digests rather than raw token values', () => {
    expect(hash('session-secret')).not.toContain('session-secret');
    expect(hash('session-secret')).toHaveLength(64);
  });
});
