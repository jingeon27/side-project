import type { TSESLint } from '@typescript-eslint/utils';

export const noElse: TSESLint.RuleModule<'noElse', []> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    docs: { description: 'else 대신 가드와 조기 반환으로 분기한다.' },
    schema: [],
    messages: { noElse: 'else 대신 early return이나 독립된 조건문을 사용하세요.' },
  },
  create(context) {
    return {
      IfStatement(node) {
        if (!node.alternate) return;
        context.report({ node: node.alternate, messageId: 'noElse' });
      },
    };
  },
};
