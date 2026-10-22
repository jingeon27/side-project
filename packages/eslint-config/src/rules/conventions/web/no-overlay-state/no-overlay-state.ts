import type { TSESLint } from '@typescript-eslint/utils';

export const noOverlayState: TSESLint.RuleModule<'overlayState', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: '오버레이 열림과 mutation 오류를 useState로 복제하지 않는다.' },
    schema: [],
    messages: {
      overlayState:
        '열림 상태는 overlay.open과 시트 props로, 요청 오류는 useMutation의 error와 ErrorLink로 처리하세요.',
    },
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'ArrayPattern') return;
        const state = node.id.elements[0];
        if (state?.type !== 'Identifier' || !/^(open|error|\w+Open|\w+Error)$/.test(state.name)) return;
        if (node.init?.type !== 'CallExpression') return;
        const callee = node.init.callee;
        const isUseState =
          (callee.type === 'Identifier' && callee.name === 'useState') ||
          (callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'useState');
        if (!isUseState) return;
        context.report({ node: state, messageId: 'overlayState' });
      },
    };
  },
};
