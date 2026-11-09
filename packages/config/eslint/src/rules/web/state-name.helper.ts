import { ASTUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

import { createFormStateCopyCheck } from './no-form-state-copy/no-form-state-copy';

// 구조분해한 첫 원소, 튜플을 담은 변수(openState), useState(…)[0]을 받은 변수 이름을 상태 이름으로 본다.
function stateIdentifier(call: TSESTree.CallExpression): TSESTree.Identifier | null {
  const parent = call.parent;
  if (parent.type === 'VariableDeclarator' && parent.init === call) {
    if (parent.id.type === 'ArrayPattern') {
      const first = parent.id.elements[0];
      return first?.type === 'Identifier' ? first : null;
    }
    return parent.id.type === 'Identifier' ? parent.id : null;
  }
  if (
    parent.type === 'MemberExpression' &&
    parent.object === call &&
    parent.property.type === 'Literal' &&
    parent.property.value === 0 &&
    parent.parent.type === 'VariableDeclarator' &&
    parent.parent.id.type === 'Identifier'
  )
    return parent.parent.id;
  return null;
}

export function visitStateNames<TMessageId extends string>(
  context: Readonly<TSESLint.RuleContext<TMessageId, []>>,
  matchesName: (name: string) => boolean,
  messageId: TMessageId,
): TSESLint.RuleListener {
  const aliases = new Set(['useState']);
  const copiedFormState = createFormStateCopyCheck(context.sourceCode);
  return {
    ImportDeclaration(node) {
      if (node.source.value !== 'react') return;
      for (const specifier of node.specifiers) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const imported = specifier.imported;
        if ((imported.type === 'Identifier' ? imported.name : imported.value) === 'useState')
          aliases.add(specifier.local.name);
      }
    },
    CallExpression(node) {
      const { callee } = node;
      const usesState =
        callee.type === 'Identifier'
          ? aliases.has(callee.name)
          : callee.type === 'MemberExpression' && ASTUtils.getPropertyName(callee) === 'useState';
      if (!usesState) return;
      const state = stateIdentifier(node);
      if (state && matchesName(state.name.replace(/(?<=.)State$/, '')) && !copiedFormState(node))
        context.report({ node: state, messageId });
    },
  };
}
