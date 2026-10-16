/** @type {import('eslint').Rule.RuleModule} */
export const noElse = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: { noElse: 'else 대신 early return이나 독립된 조건문을 사용하세요.' },
  },
  create(context) {
    return {
      IfStatement(node) {
        if (!node.alternate) return;
        context.report({ node: node.alternate, messageId: 'noElse' });
      },
    };
  },
};
