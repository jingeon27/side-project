import type { TSESLint } from '@typescript-eslint/utils';

import { createImportVisitor, fsdOptionsSchema, type TFsdOptions } from '../fsd.helper';

export const noCrossPage: TSESLint.RuleModule<'crossPage', TFsdOptions> = {
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: { description: '화면 slice끼리 import하지 않는다.' },
    schema: fsdOptionsSchema,
    messages: {
      crossPage: 'pages/{{importer}}에서 다른 화면 pages/{{target}}을 import할 수 없습니다: {{source}}',
    },
  },
  create(context) {
    return createImportVisitor(context, ({ node, source, importer, target }) => {
      if (importer.layer === 'pages' && target.layer === 'pages' && importer.slice !== target.slice)
        context.report({
          node,
          messageId: 'crossPage',
          data: { importer: importer.slice, target: target.slice, source },
        });
    });
  },
};
