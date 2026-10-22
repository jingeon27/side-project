import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

const OVERLAY = '(?:[a-z]*(?:sheet|modal|dialog|drawer|popup|popover|overlay|alert|confirm|lightbox))';
// 메뉴·아코디언 같은 화면 안 토글(menuOpen)은 오버레이가 아니다. 이름 없는 open·visible이나 오버레이 명사만 본다.
const OPEN_STATE = new RegExp(`^(?:is)?${OVERLAY}?(?:open|opened|visible|shown)$`, 'i');
const SHOW_STATE = new RegExp(`^show${OVERLAY}?$`, 'i');
// 불리언 플래그(hasLoadError)와 입력 검증 오류(emailError)는 요청 오류를 복제한 상태가 아니다.
const ERROR_STATE = /^(?:error|[a-z]\w*Error)(?:Message)?$/;
const BOOLEAN_FLAG = /^(?:has|is|should|show|did)[A-Z]/;
const FIELD_ERROR =
  /(?:email|password|name|title|body|content|field|form|validation|input|url|link|phone|code)Error(?:Message)?$/i;

function isOverlayStateName(name: string) {
  if (OPEN_STATE.test(name) || SHOW_STATE.test(name)) return true;
  return ERROR_STATE.test(name) && !BOOLEAN_FLAG.test(name) && !FIELD_ERROR.test(name);
}

function propertyName(node: TSESTree.MemberExpression) {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  if (node.property.type === 'TemplateLiteral' && node.property.expressions.length === 0)
    return node.property.quasis[0]?.value.cooked;
  return undefined;
}

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
    const useStateNames = new Set(['useState']);
    const isUseState = (callee: TSESTree.Expression) => {
      if (callee.type === 'Identifier') return useStateNames.has(callee.name);
      return callee.type === 'MemberExpression' && propertyName(callee) === 'useState';
    };
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react') return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported =
            specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
          if (imported === 'useState') useStateNames.add(specifier.local.name);
        }
      },
      CallExpression(node) {
        if (!isUseState(node.callee)) return;
        const state = stateIdentifier(node);
        if (!state || !isOverlayStateName(state.name.replace(/(?<=.)State$/, ''))) return;
        context.report({ node: state, messageId: 'overlayState' });
      },
    };
  },
};
