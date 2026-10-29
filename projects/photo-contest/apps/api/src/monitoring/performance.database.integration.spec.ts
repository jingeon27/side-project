import * as Sentry from '@sentry/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { GroupService } from '../group/group.service';
import { sentryOptions } from './sentry';

const envelopeSchema = z.tuple([
  z.unknown(),
  z.array(z.tuple([z.object({ type: z.string() }), z.unknown()])),
]);
const itemSchema = z.object({
  name: z.string(),
  value: z.number().optional(),
  unit: z.string().optional(),
  trace_id: z.string(),
  span_id: z.string().optional(),
  parent_span_id: z.string().optional(),
  attributes: z.record(z.string(), z.object({ value: z.unknown() })),
});

describe('Photo Contest API performance', () => {
  const state: { api?: ITestApi; member?: ITestUser } = {};
  const envelopes: string[] = [];
  const captured = (type: string) =>
    envelopes.flatMap((raw) =>
      envelopeSchema
        .parse(JSON.parse(raw))[1]
        .flatMap(([header, payload]) =>
          header.type === type ? z.object({ items: z.array(itemSchema) }).parse(payload).items : [],
        ),
    );
  function api() {
    if (!state.api || !state.member) throw new Error('Expected an isolated performance fixture.');
    return { app: state.api, member: state.member };
  }
  function init(tracesSampleRate: number) {
    vi.stubEnv('SENTRY_DSN', 'https://performance@sentry.invalid/1');
    vi.stubEnv('SENTRY_RELEASE', 'photo-performance-test');
    Sentry.init({
      ...sentryOptions(),
      tracesSampleRate,
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(JSON.stringify(envelope));
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
  }
  beforeAll(async () => {
    state.api = await createTestApp({ S3_BUCKET: 'performance-signing-only', S3_REGION: 'ap-northeast-2' });
    state.member = await state.api.signIn('성능계측사용자');
  });
  beforeEach(() => {
    envelopes.length = 0;
    init(1);
  });
  afterEach(async () => {
    await Sentry.close(1000);
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await state.api?.close();
  });

  it('실제 REST·GraphQL 지연을 한 trace로 연결하고 operationName·alias·변수·쿠키를 제거해야 한다', async () => {
    const { app, member } = api();
    await Sentry.withScope(async (scope) => {
      scope.setUser({ id: 'private-user', email: 'private-email@example.invalid' });
      scope.setAttribute('private.scope', 'private-scope');
      const response = await app
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .set('Cookie', member.cookie)
        .send({
          operationName: 'privateOperation',
          query: 'query privateOperation { privateAlias: me { id } }',
          variables: { privateVariable: 'private-group-id' },
        });
      expect(response.status).toBe(200);
      expect(response.body.data.privateAlias.id).toBe(member.id);
      await app.http().get('/photos/private-photo-id?token=private-token').expect(401);
    });
    await Sentry.flush(1000);
    const spans = captured('span');
    const root = spans.find((span) => span.name === 'POST /graphql');
    expect(root).toBeTruthy();
    const field = spans.find((span) => span.name === 'query me');
    expect(field).toMatchObject({ trace_id: root?.trace_id, parent_span_id: root?.span_id });
    expect(spans.map((span) => span.name)).toContain('GET /photos/:id');
    const metrics = captured('trace_metric');
    expect(metrics.filter((metric) => metric.name === 'api.http.duration')).toHaveLength(2);
    expect(
      metrics
        .filter((metric) => metric.name === 'api.graphql.fields')
        .map((metric) => metric.attributes['graphql.field']?.value),
    ).toEqual(['me']);
    for (const value of ['private', member.id, member.cookie])
      expect(envelopes.join('\n')).not.toContain(value);
  });

  it('추적 샘플링이 0이어도 HTTP·GraphQL 지연 분포를 남기고 HTTP 200의 업무 오류와 내부 오류를 구분해야 한다', async () => {
    await Sentry.close(1000);
    init(0);
    const { app, member } = api();
    const rejected = await app.gqlFail(undefined, '{ myGroups { id } }');
    expect(rejected.code).toBe('UNAUTHENTICATED');
    vi.spyOn(app.app.get(GroupService), 'myGroups').mockRejectedValueOnce(
      new Error('private-database-query'),
    );
    await app.gql(member.cookie, '{ myGroups { id } }');
    await Sentry.flush(1000);
    expect(captured('span')).toHaveLength(0);
    const metrics = captured('trace_metric');
    expect(metrics.filter((metric) => metric.name === 'api.http.requests')).toHaveLength(2);
    expect(
      metrics
        .filter((metric) => metric.name === 'api.http.duration')
        .every((metric) => metric.unit === 'millisecond'),
    ).toBe(true);
    expect(
      metrics
        .filter((metric) => metric.name === 'api.graphql.fields')
        .map((metric) => metric.attributes.outcome?.value),
    ).toEqual(['rejected', 'failed']);
    expect(envelopes.join('\n')).not.toContain('private');
  });

  it('Origin·JSON 파싱 단계의 거절도 GraphQL 요청으로 세고 health probe는 수집하지 않아야 한다', async () => {
    const { app } = api();
    await app.http().post('/graphql').send({ query: '{ me { id } }' }).expect(403);
    await app
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    await app.http().get('/health/live').expect(200);
    await Sentry.flush(1000);
    const metrics = captured('trace_metric').filter((metric) => metric.name === 'api.http.requests');
    expect(
      metrics.map((metric) => [
        metric.attributes['http.route']?.value,
        metric.attributes['http.response.status_code']?.value,
      ]),
    ).toEqual([
      ['/graphql', 403],
      ['/graphql', 400],
    ]);
    expect(captured('span').map((span) => span.name)).toEqual(['POST /graphql', 'POST /graphql']);
  });
});
