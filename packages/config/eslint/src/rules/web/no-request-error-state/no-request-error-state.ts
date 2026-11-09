import type { TSESLint } from '@typescript-eslint/utils';

import { visitStateNames } from '../state-name.helper';

const ERROR_STATE = /^(?:error|[a-z]\w*Error)(?:Message)?$/;
const BOOLEAN_FLAG = /^(?:has|is|should|show|did)[A-Z]/;
const FIELD_ERROR =
  /(?:email|password|name|title|body|content|field|form|validation|input|url|link|phone|code)Error(?:Message)?$/i;

export const noRequestErrorState: TSESLint.RuleModule<'requestErrorState', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'useState로 관리하는 요청 오류 상태를 검사한다.' },
    schema: [],
    messages: { requestErrorState: '요청 오류는 useMutation의 error와 ErrorLink로 처리하세요.' },
  },
  create(context) {
    return visitStateNames(
      context,
      (name) => ERROR_STATE.test(name) && !BOOLEAN_FLAG.test(name) && !FIELD_ERROR.test(name),
      'requestErrorState',
    );
  },
};
