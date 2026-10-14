import type { ApolloServerPlugin } from '@apollo/server';

import { reportUnexpectedError } from '../../monitoring/sentry';
import { ERROR_CODE } from '../errors';

const ANONYMOUS_OPERATION = 'anonymous';

/**
 * Apollo는 code가 없는 오류를 INTERNAL_SERVER_ERROR로 응답하므로 같은 기준으로 예상하지 못한 오류만
 * operationName 태그와 함께 보고한다. formatError에서는 operationName을 알 수 없어 여기서 보낸다.
 */
export function internalErrorReportPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didEncounterErrors({ errors, operationName }) {
          for (const error of errors) {
            const code = error.extensions.code ?? ERROR_CODE.INTERNAL_SERVER_ERROR;
            if (code === ERROR_CODE.INTERNAL_SERVER_ERROR)
              reportUnexpectedError(error, { operationName: operationName ?? ANONYMOUS_OPERATION });
          }
        },
      };
    },
  };
}
