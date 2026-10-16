import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

import type { IRuleContext } from '../rule.type';

export const noComponentFetch = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { mutation: '컴포넌트에서 fetch를 직접 호출하지 말고 useMutation과 도메인 API를 사용하세요.' },
  },
  create(context: IRuleContext<'mutation'>) {
    if (!/\.[jt]sx$/.test(context.filename) || /\.(spec|test)\.[jt]sx$/.test(context.filename)) return {};
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && callee.name === 'fetch') {
          context.report({ node, messageId: 'mutation' });
          return;
        }
        if (
          callee.type !== 'MemberExpression' ||
          callee.object.type !== 'Identifier' ||
          !['window', 'globalThis'].includes(callee.object.name)
        )
          return;
        if (callee.property.type === 'Identifier' && callee.property.name === 'fetch')
          context.report({ node, messageId: 'mutation' });
      },
    };
  },
} satisfies TSESLint.RuleModule<'mutation', []>;
