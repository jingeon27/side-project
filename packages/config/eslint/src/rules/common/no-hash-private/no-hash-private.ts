import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

type TClassMember = TSESTree.PropertyDefinition | TSESTree.MethodDefinition | TSESTree.AccessorProperty;

export const noHashPrivate: TSESLint.RuleModule<'hashPrivate', []> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    docs: { description: 'class의 비공개 멤버는 # 대신 TypeScript private으로 선언한다.' },
    schema: [],
    messages: { hashPrivate: '# 대신 TypeScript의 private 접근 제한자로 비공개 멤버를 선언하세요.' },
  },
  create(context) {
    // 선언만 보고한다. this.#name 같은 사용처는 선언을 고치면 함께 바뀐다.
    function check(node: TClassMember) {
      if (node.key.type !== 'PrivateIdentifier') return;
      context.report({ node: node.key, messageId: 'hashPrivate' });
    }

    return { PropertyDefinition: check, MethodDefinition: check, AccessorProperty: check };
  },
};
