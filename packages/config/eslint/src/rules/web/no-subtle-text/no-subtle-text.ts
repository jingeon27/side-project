import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

// subtle은 흰 바탕 2.52:1이라 글자(4.5:1)와 조작 요소 표시(3:1)에 모자라 aria-hidden 장식 아이콘에만 쓴다.
// 디자인 시스템 대비 테스트는 토큰과 공통 컴포넌트만 재므로, 앱이 클래스로 고른 subtle은 이 규칙이 막는다.
const SUBTLE_TEXT = 'text-subtle';

/** `md:placeholder:text-subtle/80!`을 변형 목록과 유틸리티 이름(`text-subtle`)으로 나눈다. */
function parseClass(token: string) {
  const parts = token.split(':');
  const utility = (parts.at(-1) ?? '').replace(/^!|!$/g, '').replace(/\/\S+$/, '');
  return { variants: parts.slice(0, -1), utility };
}

// aria-hidden, aria-hidden="true", aria-hidden={true}는 숨김이다. 변수로 넘긴 값은 정적으로 알 수 없어 숨김으로 본다.
function isAriaHidden(attribute: TSESTree.JSXAttribute | TSESTree.JSXSpreadAttribute) {
  if (attribute.type !== 'JSXAttribute' || attribute.name.type !== 'JSXIdentifier') return false;
  if (attribute.name.name !== 'aria-hidden') return false;
  const value =
    attribute.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : attribute.value;
  return !(value?.type === 'Literal' && (value.value === false || value.value === 'false'));
}

export const noSubtleText: TSESLint.RuleModule<'subtleText' | 'subtlePlaceholder', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'subtle 글자색은 aria-hidden 장식 아이콘에만 쓴다.' },
    schema: [],
    messages: {
      subtleText:
        'text-subtle(흰 바탕 2.52:1)은 aria-hidden 장식 아이콘의 className에만 씁니다. 글자는 text-muted를 쓰세요.',
      subtlePlaceholder: '자리표시도 글자라 4.5:1이 필요합니다. placeholder:text-muted를 쓰세요.',
    },
  },
  create(context) {
    // 클래스 문자열이 aria-hidden 요소의 className에 직접 적혀 있는지 본다. cva·상수에 둔 값은 요소를 알 수 없어 막는다.
    const isDecorative = (node: TSESTree.Node) => {
      const attribute = context.sourceCode
        .getAncestors(node)
        .filter((ancestor): ancestor is TSESTree.JSXAttribute => ancestor.type === 'JSXAttribute')
        .at(-1);
      if (attribute?.name.type !== 'JSXIdentifier' || attribute.name.name !== 'className') return false;
      return attribute.parent.attributes.some(isAriaHidden);
    };
    const check = (node: TSESTree.Node, text: string) => {
      for (const token of text.split(/\s+/)) {
        const { variants, utility } = parseClass(token);
        if (utility !== SUBTLE_TEXT) continue;
        if (variants.includes('placeholder')) {
          context.report({ node, messageId: 'subtlePlaceholder' });
          continue;
        }
        if (!isDecorative(node)) context.report({ node, messageId: 'subtleText' });
      }
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
