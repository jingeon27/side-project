import { describe, expect, it } from 'vitest';

import {
  scrubSentryPerformanceSpan,
  sentryPerformancePath,
  type TPerformanceSpan,
} from './sentry-performance.helper';

describe('Sentry Web Vitals 전송', () => {
  it('동적 ID·토큰과 검색어를 제외한 화면 이름으로 집계해야 한다', () => {
    expect(
      sentryPerformancePath('https://example.com/invite/private-token?q=private-query#private-fragment'),
    ).toBe('/invite/:token');
    expect(sentryPerformancePath('/invite/:token')).toBe('/invite/:token');
    expect(sentryPerformancePath('/private-person@example.com')).not.toContain('private-person');
  });
  it('측정값과 추적·릴리스 정보는 유지하고 URL·사용자·DOM 정보는 제거해야 한다', () => {
    const span: TPerformanceSpan = {
      trace_id: '1'.repeat(32),
      span_id: '2'.repeat(16),
      parent_span_id: '3'.repeat(16),
      name: 'private-dom-selector',
      start_timestamp: 1,
      end_timestamp: 2,
      status: 'ok',
      is_segment: false,
      links: [{ trace_id: '4'.repeat(32), span_id: '5'.repeat(16), attributes: { url: 'private-link' } }],
      attributes: {
        'sentry.op': 'ui.webvital.lcp',
        'sentry.origin': 'auto.http.browser.lcp',
        'sentry.segment.name': '/invite/private-token?q=private-query#private-fragment',
        'sentry.transaction': '/invite/private-token?q=private-query#private-fragment',
        'sentry.environment': 'production',
        'sentry.release': 'web-vitals-release',
        'sentry.pageload.span_id': '3'.repeat(16),
        'user_agent.original': 'Mozilla/5.0',
        'browser.web_vital.lcp.value': 1200,
        'browser.web_vital.cls.value': 0,
        'browser.web_vital.inp.value': 120,
        'browser.web_vital.fcp.value': 500,
        'browser.web_vital.ttfb.value': 40,
        'url.full': 'https://example.com/?q=private-search',
        'browser.web_vital.lcp.url': 'https://s3.example.com/private-key?X-Amz-Signature=private-signature',
        'browser.web_vital.lcp.element': '#private-person',
        'browser.web_vital.cls.source.1': '#private-person',
        'browser.web_vital.inp.target': '#private-person',
        'user.id': 'private-user',
        'user.email': 'private-email',
        'http.request.header.cookie': 'private-cookie',
        service: 'photo-contest',
        layer: 'browser',
        client: 'web',
      },
    };
    const clean = scrubSentryPerformanceSpan(span);
    expect(clean).toMatchObject({
      trace_id: span.trace_id,
      parent_span_id: span.parent_span_id,
      name: 'ui.webvital.lcp',
      attributes: {
        'sentry.segment.name': '/invite/:token',
        'sentry.transaction': '/invite/:token',
        'sentry.environment': 'production',
        'sentry.release': 'web-vitals-release',
        'sentry.pageload.span_id': '3'.repeat(16),
        'user_agent.original': 'Mozilla/5.0',
        'browser.web_vital.lcp.value': 1200,
        'browser.web_vital.cls.value': 0,
        'browser.web_vital.inp.value': 120,
        'browser.web_vital.fcp.value': 500,
        'browser.web_vital.ttfb.value': 40,
        service: 'photo-contest',
        layer: 'browser',
        client: 'web',
      },
    });
    expect(JSON.stringify(clean)).not.toContain('private');
    expect(clean).not.toHaveProperty('links');
  });
  it('페이지 span 이름도 정리하고 숫자가 아닌 성능값은 보내지 않아야 한다', () => {
    const clean = scrubSentryPerformanceSpan({
      trace_id: '1'.repeat(32),
      span_id: '2'.repeat(16),
      name: '/invite/private-token?q=private-query#private-fragment',
      start_timestamp: 1,
      end_timestamp: 2,
      status: 'ok',
      is_segment: true,
      attributes: {
        'sentry.op': 'pageload',
        'browser.web_vital.lcp.value': 'private',
        'browser.web_vital.cls.value': NaN,
      },
    });
    expect(clean.name).toBe('/invite/:token');
    expect(clean.attributes).not.toHaveProperty('browser.web_vital.lcp.value');
    expect(clean.attributes).not.toHaveProperty('browser.web_vital.cls.value');
  });
});
