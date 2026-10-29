import type { ErrorEvent, Event } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { scrubSentryEvent, toSentryTransaction } from './sentry.helper';

it('오류 원문·추가 데이터·스택의 쿼리와 지역 변수를 전송하지 않아야 한다', () => {
  const result = scrubSentryEvent({
    type: undefined,
    message: 'private-message',
    extra: { nickname: 'private-nickname' },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: 'private-error-message',
          stacktrace: {
            frames: [
              {
                filename: 'https://site.test/app.js?token=private-query',
                abs_path: 'https://site.test/app.js#private-fragment',
                function: 'submit',
                vars: { password: 'private-password' },
                context_line: 'private-source',
                pre_context: ['private-before'],
                post_context: ['private-after'],
              },
            ],
          },
        },
      ],
    },
  } satisfies ErrorEvent);
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(result.exception?.values?.[0]).toMatchObject({
    type: 'TypeError',
    value: 'Unexpected TypeError',
    stacktrace: {
      frames: [
        { filename: 'https://site.test/app.js', abs_path: 'https://site.test/app.js', function: 'submit' },
      ],
    },
  });
});

it('React 오류 번호는 원인 추적을 위해 남겨야 한다', () => {
  const result = scrubSentryEvent({
    type: undefined,
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Minified React error #418; visit https://react.dev/errors/418?args[]=private-value',
        },
      ],
    },
  } satisfies ErrorEvent);
  expect(result.exception?.values?.[0]?.value).toBe('React error #418');
});

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
