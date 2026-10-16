import type { TSESLint } from '@typescript-eslint/utils';

export const noComponentFetch: TSESLint.RuleModule<'mutation', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: '컴포넌트 파일의 직접 fetch 대신 도메인 mutation을 쓴다.' },
    schema: [],
    messages: { mutation: '컴포넌트에서 fetch를 직접 호출하지 말고 useMutation과 도메인 API를 사용하세요.' },
  },
  create(context) {
    if (!/\.[jt]sx$/.test(context.filename) || /\.(spec|test)\.[jt]sx$/.test(context.filename)) return {};
    return {
      CallExpression(node) {
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
};
