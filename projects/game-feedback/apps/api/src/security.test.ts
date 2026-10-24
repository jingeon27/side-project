import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { OnboardInputSchema, PostInputSchema } from '@game-feedback/contracts';

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
