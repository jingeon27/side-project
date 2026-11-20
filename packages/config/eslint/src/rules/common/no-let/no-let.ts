import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

// 모듈 최상위의 let은 store·싱글턴처럼 실제로 바뀌는 모듈 상태다. 객체 속성이나 class로 옮겨 가변성을 숨기지 않도록 허용한다.
function isModuleState(node: TSESTree.VariableDeclaration) {
  if (node.parent.type === 'Program') return true;
  return node.parent.type === 'ExportNamedDeclaration' && node.parent.parent.type === 'Program';
}

export const noLet: TSESLint.RuleModule<'noLet', []> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    docs: { description: '함수 안의 단계별 결과는 let 재대입 대신 const와 함수 반환값으로 잇는다.' },
    schema: [],
    messages: {
      noLet:
        'let 대신 const를 쓰고, 단계별 결과는 함수 반환값으로 전달하세요. 모듈 수준의 가변 상태만 let으로 둡니다.',
    },
  },
  create(context) {
    return {
      VariableDeclaration(node) {
        if (node.kind !== 'let' || isModuleState(node)) return;
        context.report({ node, messageId: 'noLet' });
      },
    };
  },
};
