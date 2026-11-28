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
  expect(returnPath('/journal?draft=1')).toBe('/journal?draft=1');
  expect(returnPath('/shop/orders?paymentId=dw-' + 'a'.repeat(32))).toContain('paymentId=');
});
