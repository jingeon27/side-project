import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportableError, reportUnexpectedError, sentryOptions } from './sentry';

afterEach(async () => {
  await Sentry.close(1000);
  vi.unstubAllEnvs();
});

describe('저장소 오류 원인의 안전한 보고', () => {
  it('GraphQL·HTTP 래퍼 아래 원인 종류·코드·프레임만 실제 SDK 전송에 남겨야 한다', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://cause@sentry.invalid/1');
    const envelopes: string[] = [];
    Sentry.init({
      ...sentryOptions(),
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(JSON.stringify(envelope));
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    const cause = Object.assign(new Error('private-storage-query'), {
      name: 'TimeoutError',
      code: 'ETIMEDOUT',
      stack: 'TimeoutError: private-storage-query\nSELECT private-sql\n    at head (/app/storage.ts:12:3)',
    });
    const http = new Error('private-http-message', { cause });
    const graphql = Object.assign(new Error('private-graphql-message'), { originalError: http });
    reportUnexpectedError(graphql, { route: 'upload.complete' });
    await Sentry.flush(1000);
    const payload = envelopes.join('\n');
    expect(payload).toContain('Unexpected TimeoutError ETIMEDOUT');
    expect(payload).toContain('/app/storage.ts');
    expect(payload).not.toContain('private-');
    expect(payload).not.toContain('SELECT');
  });

  it('순환하거나 깊은 원인 체인도 유한하게 처리하고 원래 오류를 변경하지 않아야 한다', () => {
    const first = new Error('private-first');
    const second = new Error('private-second', { cause: first });
    first.cause = second;
    expect(reportableError(first).message).toBe('Unexpected Error');
    expect(first.cause).toBe(second);
    const deep = Array.from({ length: 100 }).reduce<Error>(
      (cause) => new Error('private-wrapper', { cause }),
      new Error('private-source'),
    );
    expect(reportableError(deep).message).toBe('Unexpected Error');
  });
});
