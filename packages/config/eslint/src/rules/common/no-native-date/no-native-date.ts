import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

const STATIC_METHODS = new Set(['now', 'parse', 'UTC']);

export const noNativeDate: TSESLint.RuleModule<'nativeDate', []> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    docs: { description: '날짜 생성·파싱·계산은 dayjs로 하고 native Date는 경계에서 .toDate()로만 만든다.' },
    schema: [],
    messages: {
      nativeDate:
        '날짜 생성·파싱은 dayjs를 사용하세요. Prisma·Intl처럼 native Date가 필요한 경계에서만 .toDate()로 변환합니다.',
    },
  },
  create(context) {
    // 지역에서 Date라는 이름을 다시 선언했다면 전역 Date가 아니므로 검사하지 않는다.
    function isGlobalDate(node: TSESTree.Node): node is TSESTree.Identifier {
      if (node.type !== 'Identifier' || node.name !== 'Date') return false;
      const reference = context.sourceCode
        .getScope(node)
        .references.find((candidate) => candidate.identifier === node);
      return !reference?.resolved || reference.resolved.defs.length === 0;
    }

    return {
      NewExpression(node) {
        if (!isGlobalDate(node.callee)) return;
        context.report({ node, messageId: 'nativeDate' });
      },
      CallExpression(node) {
        if (isGlobalDate(node.callee)) {
          context.report({ node, messageId: 'nativeDate' });
          return;
        }
        if (node.callee.type !== 'MemberExpression' || !isGlobalDate(node.callee.object)) return;
        const property = node.callee.property;
        if (property.type !== 'Identifier' || !STATIC_METHODS.has(property.name)) return;
        context.report({ node, messageId: 'nativeDate' });
      },
    };
  },
};
