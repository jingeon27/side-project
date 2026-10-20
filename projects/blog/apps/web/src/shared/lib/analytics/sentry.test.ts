import { expect, it } from 'vitest';

import { scrubSentryEvent } from '@/shared/lib/analytics/sentry';

it('filters Sentry user data, request content, URL queries and email addresses', () => {
  const safe = scrubSentryEvent({
    user: { id: '123', email: 'hello@example.com' },
    request: {
      url: 'https://blog.example/ko/blog?token=secret#anchor',
      data: 'private',
      headers: { cookie: 'secret' },
      cookies: { auth: 'secret' },
      query_string: 'private',
    },
    exception: { values: [{ value: 'Request by hello@example.com Bearer secret' }] },
    extra: { search_query: 'private', category: 'engineering' },
  });
  expect(safe).not.toHaveProperty('user');
  expect(safe?.request).toEqual({ url: 'https://blog.example/ko/blog' });
  expect(JSON.stringify(safe)).not.toContain('secret');
  expect(JSON.stringify(safe)).not.toContain('hello@example.com');
  expect(safe?.extra).toEqual({ category: 'engineering' });
  expect(scrubSentryEvent({ exception: { values: [{ value: 'NEXT_HTTP_ERROR_FALLBACK;404' }] } })).toBeNull();
});

it('scrubs streamed span names, attributes and linked attributes without breaking trace identity', async () => {
  const { scrubSentrySpan } = await import('@/shared/lib/analytics/sentry');
  const span = {
    trace_id: 'a'.repeat(32),
    span_id: 'b'.repeat(16),
    is_segment: true,
    name: 'GET https://blog.example/ko/blog?search=private#anchor',
    start_timestamp: 1,
    end_timestamp: 2,
    status: 'ok',
    attributes: {
      'url.full': 'https://blog.example/ko/blog?search=private#anchor',
      'user.id': 'private',
      'http.request.header.authorization': 'Bearer private',
      'http.response.body': 'private',
      'gen_ai.input.messages': 'private',
      'db.query.text': 'SELECT private',
      'graphql.variables': 'private',
      'app.category': 'engineering',
    },
    links: [
      {
        trace_id: 'c'.repeat(32),
        span_id: 'd'.repeat(16),
        attributes: { 'user.email': 'hello@example.com', 'sentry.op': 'navigation' },
      },
    ],
  };
  const safe = scrubSentrySpan(span);
  expect(safe.trace_id).toBe(span.trace_id);
  expect(safe.span_id).toBe(span.span_id);
  expect(safe.name).toBe('GET https://blog.example/ko/blog');
  expect(safe.attributes).toEqual({
    'url.full': 'https://blog.example/ko/blog',
    'app.category': 'engineering',
  });
  expect(safe.links[0]?.attributes).toEqual({ 'sentry.op': 'navigation' });
  expect(JSON.stringify(safe)).not.toContain('private');
  expect(span.attributes['user.id']).toBe('private');
});
