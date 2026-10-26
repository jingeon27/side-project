import { describe, expect, it } from 'vitest';

import { createTestApp } from '../test/support/app';

describe('종료 신호 소유권', () => {
  it.each([false, true])(
    'shutdownHooks=%s에 따라 종료 신호를 등록하고 앱을 닫을 때 해제해야 한다',
    async (shutdownHooks) => {
      const signals = ['SIGINT', 'SIGTERM'] as const;
      const listeners = signals.map((signal) => process.listenerCount(signal));
      const api = await createTestApp({}, { shutdownHooks });
      try {
        expect(signals.map((signal) => process.listenerCount(signal))).toEqual(
          listeners.map((count) => count + Number(shutdownHooks)),
        );
        expect((await api.http().get('/health')).status).toBe(200);
      } finally {
        await api.close();
      }
      expect(signals.map((signal) => process.listenerCount(signal))).toEqual(listeners);
    },
  );
});
