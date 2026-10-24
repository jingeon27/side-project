import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { QUERY_COST_MESSAGE, queryCostLimit } from './query-cost.rule';

const schema = buildSchema(`
  type Category { id: ID! name: String! }
  type Group { id: ID! name: String! categories: [Category!]! }
  type Query { groups(limit: Int): [Group!]! group(id: ID!): Group }
`);
const rule = queryCostLimit({ maxFields: 12, maxAliases: 2 });
const errorsOf = (query: string) => validate(schema, parse(query), [rule]).map((error) => error.message);

describe('queryCostLimit', () => {
  it('상한 안의 일반 조회는 통과해야 한다', () => {
    expect(errorsOf('{ groups(limit: 48) { id name categories { id name } } }')).toEqual([]);
    expect(errorsOf('{ a: group(id: "1") { id } b: group(id: "2") { id } }')).toEqual([]);
  });

  it('alias가 상한을 넘으면 거절해야 한다', () => {
    const query = `{ ${Array.from({ length: 3 }, (_, index) => `g${index}: groups { id }`).join(' ')} }`;
    expect(errorsOf(query)).toEqual([QUERY_COST_MESSAGE.ALIASES]);
  });

  it('조각을 펼친 필드 수로 세고 상한을 넘으면 거절해야 한다', () => {
    const query = `
      fragment Row on Group { id name categories { id name } }
      { groups { ...Row } group(id: "1") { ...Row ... on Group { ...Row } } }
    `;
    expect(errorsOf(query)).toEqual([QUERY_COST_MESSAGE.FIELDS]);
  });

  it('겹쳐 쓴 조각이 기하급수로 커져도 상한에서 세기를 멈춰야 한다', () => {
    const levels = Array.from({ length: 30 }, (_, index) => index);
    const fragments = levels
      .map((index) =>
        index === 0
          ? 'fragment F0 on Group { id name }'
          : `fragment F${index} on Group { ...F${index - 1} ...F${index - 1} }`,
      )
      .join('\n');
    const started = Date.now();
    expect(errorsOf(`${fragments}\n{ groups { ...F29 } }`)).toEqual([QUERY_COST_MESSAGE.FIELDS]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
