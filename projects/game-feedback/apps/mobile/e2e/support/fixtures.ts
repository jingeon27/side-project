import { test as base, expect } from '@playwright/test';
import { installNativeHost } from './native-host';
export const test = base.extend<{ nativeHost: Awaited<ReturnType<typeof installNativeHost>> }>({
  nativeHost: async ({ page }, runFixture) => {
    const host = await installNativeHost(page);
    try {
      await runFixture(host);
    } finally {
      host.dispose();
    }
  },
});
export { expect };
