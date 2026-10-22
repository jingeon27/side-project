import type { ErrorEvent, Event } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { scrubSentryEvent, toSentryTransaction } from './sentry.helper';

describe('Sentry 트랜잭션 이름', () => {
  it('브라우저 오류의 원본 경로(초대 토큰)를 path_template로 바꿔 보내야 한다', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: '초대 수락 실패',
      transaction: '/invite/secret-token',
    };
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.transaction).toBe('/invite/:token');
    expect(JSON.stringify(scrubbed)).not.toContain('secret-token');
  });

  it('트랜잭션 이벤트에도 같은 정규화를 적용해야 한다', () => {
    const event: Event = { type: 'transaction', transaction: '/groups/clx1?sort=popular' };
    expect(scrubSentryEvent(event).transaction).toBe('/groups/:id');
  });

  it('메서드가 붙은 서버 라우트·전체 URL도 경로만 바꾸고 경로가 아닌 이름은 둬야 한다', () => {
    expect(toSentryTransaction('GET /invite/[token]')).toBe('GET /invite/:token');
    expect(toSentryTransaction('https://contest.example/contests/c1#vote')).toBe('/contests/:id');
    expect(toSentryTransaction('/')).toBe('/');
    expect(toSentryTransaction('/me')).toBe('/me');
    expect(toSentryTransaction('/unknown/personal@example.com')).toBe('/unknown/:path');
    expect(toSentryTransaction('AppRouter')).toBe('AppRouter');
  });
});
