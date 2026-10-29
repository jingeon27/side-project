import type { ApolloServerPlugin } from '@apollo/server' with { 'resolution-mode': 'import' };
import { isEnabled, startInactiveSpan } from '@sentry/node';

import { DomainError, httpStatusOf } from '../common/errors';
import { recordGraphqlPerformance, registerGraphqlFields } from './performance';

function outcomeOf(error: Error | null) {
  if (!error) return 'ok';
  if (error instanceof DomainError && httpStatusOf(error.code) < 500) return 'rejected';
  return 'failed';
}

export function graphqlPerformancePlugin(): ApolloServerPlugin {
  return {
    async requestDidStart({ schema }) {
      const query = schema.getQueryType();
      const mutation = schema.getMutationType();
      registerGraphqlFields([
        ...Object.keys(query?.getFields() ?? {}),
        ...Object.keys(mutation?.getFields() ?? {}),
      ]);
      return {
        async executionDidStart() {
          return {
            willResolveField({ info }) {
              if (!isEnabled() || (info.parentType !== query && info.parentType !== mutation)) return;
              const kind = info.parentType === query ? 'query' : 'mutation';
              const started = performance.now();
              const span = startInactiveSpan({
                name: `${kind} ${info.fieldName}`,
                op: 'graphql.resolve',
                attributes: { 'graphql.field': info.fieldName, 'graphql.operation.type': kind },
              });
              return (error, result: unknown) => {
                // Nest의 GraphQL 필터는 업무 오류를 값으로 반환하고 GraphQL이 이후에 던진다.
                const failure = error ?? (result instanceof Error ? result : null);
                const outcome = outcomeOf(failure);
                if (failure) span.setStatus({ code: 2 });
                recordGraphqlPerformance(info.fieldName, kind, performance.now() - started, outcome);
                span.end();
              };
            },
          };
        },
      };
    },
  };
}
