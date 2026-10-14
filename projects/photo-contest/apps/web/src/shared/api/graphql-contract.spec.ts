import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  Kind,
  NoUnusedFragmentsRule,
  buildASTSchema,
  concatAST,
  parse,
  specifiedRules,
  validate,
} from 'graphql';
import type { DefinitionNode, DocumentNode, OperationDefinitionNode } from 'graphql';
import { describe, expect, it } from 'vitest';

const APP_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const readDocuments = (pattern: string) =>
  globSync(pattern, { cwd: APP_ROOT })
    .sort()
    .map((file) => ({ file, document: parse(readFileSync(`${APP_ROOT}${file}`, 'utf8')) }));

/**
 * API는 모듈마다 `type Query`/`type Mutation`을 따로 선언하고 Nest가 합친다.
 * graphql-js로 같은 스키마를 만들려고 같은 이름의 두 번째 타입부터 extend로 바꾼다.
 */
function buildApiSchema() {
  const seen = new Set<string>();
  const definitions = readDocuments('../api/src/**/*.graphql').flatMap(({ document }) =>
    document.definitions.map((definition): DefinitionNode => {
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) return definition;
      if (!seen.has(definition.name.value)) {
        seen.add(definition.name.value);
        return definition;
      }
      return { ...definition, kind: Kind.OBJECT_TYPE_EXTENSION };
    }),
  );
  return buildASTSchema({ kind: Kind.DOCUMENT, definitions });
}

const operationsOf = (document: DocumentNode) =>
  document.definitions.filter(
    (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION,
  );

describe('GraphQL 문서 계약', () => {
  const schema = buildApiSchema();
  const documents = readDocuments('src/features/**/*.graphql');
  // fragment는 파일을 넘어 쓰이므로(GroupCard 등) codegen처럼 모든 문서를 하나로 합쳐 검증한다.
  const combined = concatAST(documents.map(({ document }) => document));

  it('기능 문서를 모두 찾아야 한다', () => {
    expect(documents.map(({ file }) => file)).toEqual(
      expect.arrayContaining([
        'src/features/auth/api/auth.graphql',
        'src/features/group/api/group.graphql',
        'src/features/invite/api/invite.graphql',
        'src/features/contest/api/contest.graphql',
        'src/features/submission/api/submission.graphql',
        'src/features/like/api/like.graphql',
        'src/features/vote/api/vote.graphql',
        'src/features/moderation/api/moderation.graphql',
        'src/features/ranking/api/ranking.graphql',
      ]),
    );
  });

  it('모든 연산·fragment가 API 스키마에 맞아야 한다', () => {
    // 캐시 갱신(updateFragment)에만 쓰는 fragment는 연산에서 쓰이지 않아도 된다.
    const rules = specifiedRules.filter((rule) => rule !== NoUnusedFragmentsRule);
    const errors = validate(schema, combined, rules).map((error) => error.message);
    expect(errors).toEqual([]);
  });

  it('연산마다 이름이 있고 겹치지 않아야 한다', () => {
    const names = operationsOf(combined).map((operation) => operation.name?.value);
    expect(names).not.toContain(undefined);
    expect(new Set(names).size).toBe(names.length);
  });

  it('API가 바꾼 필드 대신 새 계약 필드를 써야 한다', () => {
    const source = documents.map(({ file }) => readFileSync(`${APP_ROOT}${file}`, 'utf8')).join('\n');
    // Contest.myVoteId → votedSubmissionId, Contest.submissions 삭제
    expect(source).not.toMatch(/\bmyVoteId\b/);
    expect(validate(schema, parse('query X { contest(id: "1") { submissions { id } } }'))).not.toEqual([]);
  });
});
