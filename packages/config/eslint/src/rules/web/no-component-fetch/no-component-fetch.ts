import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);

function staticName(node: TSESTree.Node, computed: boolean) {
  if (!computed && node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked;
  return undefined;
}

// window.fetch, globalThis.window['fetch'], const { fetch } = self처럼 전역 객체를 거쳐 fetch에 닿는 노드를 찾는다.
function fetchThroughGlobal(identifier: TSESTree.Identifier): TSESTree.Node | null {
  let node: TSESTree.Node = identifier;
  while (node.parent?.type === 'MemberExpression' && node.parent.object === node) {
    const name = staticName(node.parent.property, node.parent.computed);
    if (name === 'fetch') return node.parent;
    if (!name || !GLOBAL_OBJECTS.has(name)) return null;
    node = node.parent;
  }
  const declarator = node.parent;
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.init !== node ||
    declarator.id.type !== 'ObjectPattern'
  )
    return null;
  return (
    declarator.id.properties.find(
      (property) => property.type === 'Property' && staticName(property.key, property.computed) === 'fetch',
    ) ?? null
  );
}

export const noComponentFetch: TSESLint.RuleModule<'mutation', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: '컴포넌트 파일의 직접 fetch 대신 도메인 mutation을 쓴다.' },
    schema: [],
    messages: { mutation: '컴포넌트에서 fetch를 직접 호출하지 말고 useMutation과 도메인 API를 사용하세요.' },
  },
  create(context) {
    if (!/\.[jt]sx$/.test(context.filename) || /\.(spec|test)\.[jt]sx$/.test(context.filename)) return {};
    return {
      // 지역 변수·매개변수 fetch(useQuery의 refetch 별칭 등)는 제외하고 전역 fetch 참조만 본다.
      'Program:exit'(program) {
        const globalScope = context.sourceCode.getScope(program);
        const globalReferences = (name: string) => {
          const variable = globalScope.set.get(name);
          if (variable && variable.defs.length > 0) return [];
          return [
            ...(variable?.references ?? []),
            ...globalScope.through.filter((reference) => reference.identifier.name === name),
          ];
        };
        // 호출뿐 아니라 별칭 대입·.call/.apply·인자로 넘기는 참조도 fetch를 쓰는 것이다. typeof 검사는 제외한다.
        for (const { identifier } of globalReferences('fetch')) {
          const parent = identifier.parent;
          if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') continue;
          if (parent?.type === 'TSTypeQuery') continue;
          context.report({ node: identifier, messageId: 'mutation' });
        }
        for (const objectName of GLOBAL_OBJECTS)
          for (const { identifier } of globalReferences(objectName)) {
            const access = fetchThroughGlobal(identifier as TSESTree.Identifier);
            if (access) context.report({ node: access, messageId: 'mutation' });
          }
      },
    };
  },
};
