import { createRequire } from 'node:module';

import { GraphQLSchemaHost } from '@nestjs/graphql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../support/app';
import type { ITestApi } from '../support/app';

// Nest가 만드는 CJS GraphQLSchema와 같은 graphql 인스턴스로 검사한다(Vitest의 ESM 사본과 섞지 않는다).
const { validateSchema } = createRequire(import.meta.url)('graphql') as Pick<
  typeof import('graphql'),
  'validateSchema'
>;

describe('기동한 GraphQL 스키마', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('스키마가 유효하고 모든 Query·Mutation 필드가 실행할 resolver와 연결돼야 한다', () => {
    const { schema } = api.app.get(GraphQLSchemaHost);
    expect(validateSchema(schema)).toEqual([]);
    for (const type of [schema.getQueryType(), schema.getMutationType()]) {
      expect(type).toBeDefined();
      const missing = Object.entries(type?.getFields() ?? {})
        .filter(([, field]) => typeof field.resolve !== 'function')
        .map(([name]) => name);
      expect(missing).toEqual([]);
    }
  });
});
