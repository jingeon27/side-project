import { test as base, expect, type BrowserContext } from '@playwright/test';

import { createTestUser, graphqlRequest } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './env';
import { waitForHydrationOnLoad } from './hydration';
import { observeRuntimeErrors } from './runtime-errors';

export async function authenticate(context: BrowserContext, nickname: string) {
  const cookie = await createTestUser(API_URL, { nickname, origin: WEB_ORIGIN });
  await context.addCookies([
    {
      name: 'contest_session',
      value: cookie.slice('contest_session='.length),
      url: WEB_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return cookie;
}

export async function seedGroup(cookie: string, name: string, visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC') {
  const result = await graphqlRequest<{ createGroup: { id: string; inviteToken: string } }>(
    `${WEB_ORIGIN}/backend`,
    {
      cookie,
      origin: WEB_ORIGIN,
      query:
        'mutation($name: String!, $visibility: GroupVisibility!) { createGroup(name: $name, visibility: $visibility) { id inviteToken } }',
      variables: { name, visibility },
    },
  );
  if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data.createGroup;
}

export const test = base.extend<{ signIn: (nickname: string) => Promise<string> }>({
  page: async ({ page }, provide) => {
    const errors = await observeRuntimeErrors(page);
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal{display:none!important}';
        document.head.append(style);
      }),
    );
    await provide(waitForHydrationOnLoad(page));
    expect(errors).toEqual([]);
  },
  signIn: async ({ context }, provide) => {
    await provide((nickname) => authenticate(context, nickname));
  },
});

export { expect };
export { waitForHydrationOnLoad } from './hydration';
