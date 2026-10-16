import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

import type { IRuleContext } from '../rule.type';

export const noElse = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { noElse: 'else 대신 early return이나 독립된 조건문을 사용하세요.' },
  },
  create(context: IRuleContext<'noElse'>) {
    return {
      IfStatement(node: TSESTree.IfStatement) {
        if (!node.alternate) return;
        context.report({ node: node.alternate, messageId: 'noElse' });
      },
    };
  },
} satisfies TSESLint.RuleModule<'noElse', []>;
