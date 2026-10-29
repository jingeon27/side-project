import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

const HANDLER_NAME = /^handle[A-Z]/;
const REACT_CALLBACK_HOOKS = ['useCallback', 'useEffectEvent'];
const CALLBACK_FIRST = new Set([
  'addNotificationResponseReceivedListener',
  'addNotificationReceivedListener',
  'addPushTokenListener',
]);
const CALLBACK_SECOND = new Set(['addEventListener', 'removeEventListener', 'onEvent', 'handleRequest']);
const OBSERVERS = new Set(['IntersectionObserver', 'ResizeObserver', 'MutationObserver']);

function nameOf(node: TSESTree.Node): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'MemberExpression' && (!node.computed || node.property.type === 'Literal'))
    return nameOf(node.property);
  return undefined;
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'ChainExpression'
  )
    return unwrap(node.expression);
  return node;
}

function findVariable(scope: TSESLint.Scope.Scope | null, name: string): TSESLint.Scope.Variable | undefined {
  if (!scope) return undefined;
  const variable = scope.set.get(name);
  return variable ?? findVariable(scope.upper, name);
}

function isInternal(node: TSESTree.Node | undefined): boolean {
  if (!node || node.type === 'Program') return false;
  if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'ClassBody'
  )
    return true;
  return isInternal(node.parent);
}

function isAuthoredCallback(node: TSESTree.Node | null, hookNames: ReadonlySet<string>): boolean {
  if (!node) return false;
  const value = unwrap(node);
  if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') return true;
  return (
    value.type === 'CallExpression' &&
    hookNames.has(nameOf(value.callee) ?? '') &&
    Boolean(value.arguments[0] && isAuthoredCallback(value.arguments[0], hookNames))
  );
}

export const handlerNames: TSESLint.RuleModule<'handlerName', []> = {
  defaultOptions: [],
  meta: {
    type: 'suggestion',
    docs: {
      description: '내부에서 작성한 이벤트 핸들러는 handle*로 선언하고 기존 함수 참조는 그대로 넘긴다.',
    },
    schema: [],
    messages: { handlerName: '직접 작성한 이벤트 핸들러 {{name}}은 handle*로 이름 지으세요.' },
  },
  create(context) {
    const hookNames = new Set(REACT_CALLBACK_HOOKS);
    const reported = new WeakSet<TSESTree.Node>();
    const checkHandler = (candidate: TSESTree.Node | undefined) => {
      if (!candidate) return;
      const node = unwrap(candidate);
      if (node.type !== 'Identifier' || HANDLER_NAME.test(node.name)) return;
      const variable = findVariable(context.sourceCode.getScope(node), node.name);
      for (const definition of variable?.defs ?? []) {
        const declaration = definition.node;
        if (!isInternal(declaration.parent)) continue;
        const authored =
          declaration.type === 'FunctionDeclaration' ||
          (declaration.type === 'VariableDeclarator' &&
            declaration.id.type === 'Identifier' &&
            isAuthoredCallback(declaration.init, hookNames));
        if (!authored || reported.has(definition.name)) continue;
        reported.add(definition.name);
        context.report({ node: definition.name, messageId: 'handlerName', data: { name: node.name } });
      }
    };
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react') return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = nameOf(specifier.imported);
          if (imported && REACT_CALLBACK_HOOKS.includes(imported)) hookNames.add(specifier.local.name);
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !/^on[A-Z]/.test(node.name.name)) return;
        if (node.value?.type === 'JSXExpressionContainer') checkHandler(node.value.expression);
      },
      CallExpression(node) {
        const method = nameOf(node.callee) ?? '';
        if (CALLBACK_SECOND.has(method)) checkHandler(node.arguments[1]);
        if (CALLBACK_FIRST.has(method)) checkHandler(node.arguments[0]);
      },
      NewExpression(node) {
        if (OBSERVERS.has(nameOf(node.callee) ?? '')) checkHandler(node.arguments[0]);
      },
    };
  },
};
