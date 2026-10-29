import { ApolloServer } from '@apollo/server';
import * as Sentry from '@sentry/node';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { DomainError, ERROR_CODE } from '../common/errors';
import { graphqlPerformancePlugin } from './graphql-performance.plugin';
import { recordHttpPerformance } from './performance';
import { sentryOptions } from './sentry';

const envelopeSchema = z.tuple([
  z.unknown(),
  z.array(z.tuple([z.object({ type: z.string() }), z.unknown()])),
]);
const sampleSchema = z.object({
  name: z.string(),
  value: z.number().optional(),
  attributes: z.record(z.string(), z.object({ value: z.unknown() })),
});

afterEach(async () => {
  await Sentry.close(1000);
  vi.unstubAllEnvs();
});

it('실제 Apollo 실행에서 alias·operationName·변수 대신 스키마 필드와 업무/내부 오류를 구분해야 한다', async () => {
  vi.stubEnv('SENTRY_DSN', 'https://performance@sentry.invalid/1');
  const envelopes: string[] = [];
  Sentry.init({
    ...sentryOptions(),
    tracesSampleRate: 1,
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  const server = new ApolloServer({
    typeDefs:
      'type Query { sample: String reject: String crash: String returnedReject: String returnedCrash: String }',
    resolvers: {
      Query: {
        sample: () => 'ok',
        reject: () => {
          throw new DomainError('private-rejected', ERROR_CODE.FORBIDDEN);
        },
        crash: () => {
          throw new Error('private-crash');
        },
        returnedReject: () => new DomainError('private-returned-rejection', ERROR_CODE.UNAUTHENTICATED),
        returnedCrash: async () => new Error('private-returned-crash'),
      },
    },
    plugins: [graphqlPerformancePlugin()],
  });
  try {
    await Sentry.withScope(async (scope) => {
      scope.setUser({ id: 'private-user' });
      scope.setAttribute('private.scope', 'private-scope');
      await server.executeOperation({
        query: 'query privateOperation { privateAlias: sample reject crash returnedReject returnedCrash }',
        variables: { privateVariable: 'private-value' },
      });
      recordHttpPerformance('/graphql', 'POST', 200, 4, false);
    });
    await Sentry.flush(1000);
    const samples = (type: string) =>
      envelopes.flatMap((raw) =>
        envelopeSchema
          .parse(JSON.parse(raw))[1]
          .flatMap(([header, payload]) =>
            header.type === type ? z.object({ items: z.array(sampleSchema) }).parse(payload).items : [],
          ),
      );
    expect(samples('span').map((span) => span.name)).toEqual(
      expect.arrayContaining([
        'query sample',
        'query reject',
        'query crash',
        'query returnedReject',
        'query returnedCrash',
      ]),
    );
    expect(
      samples('trace_metric')
        .filter((metric) => metric.name === 'api.graphql.fields')
        .map((metric) => [metric.attributes['graphql.field']?.value, metric.attributes.outcome?.value]),
    ).toEqual(
      expect.arrayContaining([
        ['sample', 'ok'],
        ['reject', 'rejected'],
        ['crash', 'failed'],
        ['returnedReject', 'rejected'],
        ['returnedCrash', 'failed'],
      ]),
    );
    expect(envelopes.join('\n')).not.toContain('private');
    expect(envelopes.join('\n')).not.toContain('server.address');
  } finally {
    await server.stop();
  }
});
