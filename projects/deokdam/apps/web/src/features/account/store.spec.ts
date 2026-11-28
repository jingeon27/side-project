import { expect, it } from 'vitest';

import { returnPath } from './navigation';
import { AccountStore } from './store';

it('binds one-time login requests to the browser and provider, and revokes issued sessions', () => {
  const store = new AccountStore(':memory:');
  try {
    const pending = store.begin('google', '/shop');
    expect(store.consume('kakao', pending.state, pending.binding)).toBeUndefined();
    expect(store.consume('google', pending.state, 'another-browser')).toBeUndefined();
    expect(store.consume('google', pending.state, pending.binding)?.next).toBe('/shop');
    expect(store.consume('google', pending.state, pending.binding)).toBeUndefined();
    const account = store.signIn('google', '123');
    expect(store.signIn('google', '123').owner).toBe(account.owner);
    expect(store.signIn('kakao', '123').owner).not.toBe(account.owner);
    expect(store.account(account.session)?.id).toBe(account.owner);
    store.signOut(account.session);
    expect(store.account(account.session)).toBeNull();
  } finally {
    store.close();
  }
});
it('retains only supported local destinations and known query parameters', () => {
  expect(returnPath('https://example.com')).toBe('/journal');
  expect(returnPath('//example.com/shop')).toBe('/journal');
  expect(returnPath('/shop?topic=parent&extra=private')).toBe('/shop?topic=parent');
  expect(returnPath('/journal?draft=1')).toBe('/journal');
  expect(returnPath('/shop/orders?paymentId=dw-' + 'a'.repeat(32))).toContain('paymentId=');
});

it('keeps each kind of history idempotent and scoped to the owner, including colliding guest practices', () => {
  const store = new AccountStore(':memory:');
  try {
    const a = store.signIn('local', 'fixture-A').owner;
    const b = store.signIn('local', 'fixture-B').owner;
    const stamp = { date: '2026-06-20', createdAt: '2026-06-20T02:30:00.000Z' };
    const card = {
      ...stamp,
      id: 'a'.repeat(64),
      page: { kind: 'message', episode: 'baek-beonjjae-jiwonseo', text: '친구에게 건넨 한마디' },
    } as const;
    const reading = {
      ...stamp,
      id: 'b'.repeat(64),
      page: {
        kind: 'reading',
        topic: 'job',
        concern: 'silence',
        element: 'metal',
        reading: { mode: 'basic', interpretation: '기다리는 동안 함께할 일을 한 가지 정해보세요.' },
      },
    } as const;
    const practice = {
      ...stamp,
      id: 'c'.repeat(64),
      page: { kind: 'practice', topic: 'job', action: '한 문장 읽기', note: '친구와 함께' },
    } as const;
    const other = {
      ...practice,
      id: 'd'.repeat(64),
      page: { ...practice.page, note: '다른 기기에서 남긴 기록' },
    };
    for (const entry of [card, reading, practice, other]) {
      expect(store.addActivity(a, entry)).toBe(true);
      expect(store.addActivity(a, entry)).toBe(false);
    }
    expect(store.records(a)).toHaveLength(1);
    expect(store.activities(a)).toHaveLength(3);
    expect(store.activities(b)).toEqual([]);
    expect(store.addActivity(b, card)).toBe(true);
    store.removeActivity(b, card.id);
    expect(store.activities(a)).toContainEqual(card);
    expect(store.activities(b)).toEqual([]);
  } finally {
    store.close();
  }
});
