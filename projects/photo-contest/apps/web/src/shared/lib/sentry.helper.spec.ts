import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import {
  buildSentryClientTags,
  resolveClientSentryDsn,
  resolveServerSentryDsn,
  scrubSentryEvent,
} from './sentry.helper';

describe('sentry.helper', () => {
  it('DSN이 비어 있으면 null이어야 한다', () => {
    expect(resolveClientSentryDsn({})).toBeNull();
    expect(resolveClientSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: '  ' })).toBeNull();
    expect(resolveServerSentryDsn({ SENTRY_DSN: '' })).toBeNull();
  });

  it('서버는 SENTRY_DSN을 먼저 쓰고 없으면 공개 DSN을 써야 한다', () => {
    expect(
      resolveServerSentryDsn({ SENTRY_DSN: 'https://server', NEXT_PUBLIC_SENTRY_DSN: 'https://public' }),
    ).toBe('https://server');
    expect(resolveServerSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: 'https://public' })).toBe('https://public');
  });

  it('앱 안이면 client=app과 앱 버전을, 아니면 client=web만 붙여야 한다', () => {
    expect(buildSentryClientTags({ appVersion: '1.0.0' })).toEqual({ client: 'app', app_version: '1.0.0' });
    expect(buildSentryClientTags(null)).toEqual({ client: 'web' });
  });

  it('요청·쿠키·사용자·브레드크럼을 지워야 한다', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: '사진을 불러오지 못했습니다.',
      request: { url: 'https://contest.example/invite/secret', cookies: { contest_session: 'raw' } },
      user: { id: 'user-1' },
      breadcrumbs: [{ message: '닉네임 입력' }],
      contexts: { request: { url: 'x' }, cookies: { contest_session: 'raw' }, os: { name: 'iOS' } },
      tags: { client: 'web' },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed).not.toHaveProperty('request');
    expect(scrubbed).not.toHaveProperty('user');
    expect(scrubbed).not.toHaveProperty('breadcrumbs');
    expect(scrubbed).not.toHaveProperty('contexts');
    expect(JSON.stringify(scrubbed)).not.toContain('secret');
    expect(scrubbed.tags).toEqual({ client: 'web' });
  });
});
