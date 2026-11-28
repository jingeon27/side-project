import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import type { BrowserContext } from '@playwright/test';

import type { TProvider } from '../src/features/account/navigation';
import { AccountStore } from '../src/features/account/store';

export const testOrigin = 'http://127.0.0.1:3461';
export const testAccountFile = fileURLToPath(new URL('../.data/e2e-accounts.sqlite', import.meta.url));

export async function signInFixture(
  context: BrowserContext,
  provider: TProvider = 'google',
  subject: string = randomUUID(),
) {
  const store = new AccountStore(testAccountFile);
  try {
    const { session, owner } = store.signIn(provider, subject);
    await context.addCookies([
      { name: 'deokdam.session', value: session, url: testOrigin, httpOnly: true, sameSite: 'Lax' },
    ]);
    return owner;
  } finally {
    store.close();
  }
}
