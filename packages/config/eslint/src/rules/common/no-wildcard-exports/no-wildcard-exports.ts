import type { TSESLint } from '@typescript-eslint/utils';

export const noWildcardExports: TSESLint.RuleModule<'explicitExports', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: '공개 API는 필요한 이름을 명시해서 내보낸다.' },
    schema: [],
    messages: { explicitExports: 'export * 대신 필요한 값과 타입의 이름을 명시해서 내보내세요.' },
  },
  create(context) {
    return {
      ExportAllDeclaration(node) {
        context.report({ node, messageId: 'explicitExports' });
      },
    };
  },
};
