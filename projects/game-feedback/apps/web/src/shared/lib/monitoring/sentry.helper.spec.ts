import { describe, expect, it } from 'vitest';

import {
  buildSentryClientTags,
  filterSentryEvent,
  resolveClientSentryDsn,
  resolveServerSentryDsn,
  scrubSentryEvent,
} from './sentry.helper';

describe('웹 Sentry 수집 범위', () => {
  it('브라우저에는 공개 DSN만 사용하고 서버 DSN을 우선해야 한다', () => {
    expect(resolveClientSentryDsn({ SENTRY_DSN: 'private' })).toBeNull();
    expect(resolveServerSentryDsn({ SENTRY_DSN: 'server', NEXT_PUBLIC_SENTRY_DSN: 'public' })).toBe('server');
    expect(resolveClientSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: '  ' })).toBeNull();
  });
  it('요청·쿠키·사용자·입력 기록을 제거해야 한다', () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: { url: 'https://example.com/?q=private', headers: { Cookie: 'private' } },
      user: { id: 'private' },
      breadcrumbs: [{ message: 'private' }],
      contexts: { request: { body: 'private' }, cookies: { session: 'private' } },
    });
    expect(JSON.stringify(event)).not.toContain('private');
  });
  it('취소는 제외하고 React 하이드레이션 오류는 보고해야 한다', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    expect(filterSentryEvent({ type: undefined }, aborted)).toBeNull();
    expect(filterSentryEvent({ type: undefined }, new Error('Minified React error #418'))).not.toBeNull();
  });
  it('브라우저와 WebView를 구분해야 한다', () => {
    expect(buildSentryClientTags(false)).toEqual({ client: 'browser' });
    expect(buildSentryClientTags(true)).toEqual({ client: 'webview' });
  });
});
