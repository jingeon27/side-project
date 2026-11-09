import { ASTUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

const OVERLAY = '(?:[a-z]*(?:sheet|modal|dialog|drawer|popup|popover|overlay|alert|confirm|lightbox))';
// 메뉴·아코디언 같은 화면 안 토글(menuOpen)은 오버레이가 아니다. 이름 없는 open·visible이나 오버레이 명사만 본다.
const OPEN_STATE = new RegExp(`^(?:is)?${OVERLAY}?(?:open|opened|visible|shown)$`, 'i');
const SHOW_STATE = new RegExp(`^show${OVERLAY}?$`, 'i');
// 불리언 플래그와 필드 오류는 이름 검사에서 제외하고, RHF 값의 복제는 출처를 확인한다.
const ERROR_STATE = /^(?:error|[a-z]\w*Error)(?:Message)?$/;
const BOOLEAN_FLAG = /^(?:has|is|should|show|did)[A-Z]/;
const FIELD_ERROR =
  /(?:email|password|name|title|body|content|field|form|validation|input|url|link|phone|code)Error(?:Message)?$/i;

function isOverlayStateName(name: string) {
  if (OPEN_STATE.test(name) || SHOW_STATE.test(name)) return true;
  return ERROR_STATE.test(name) && !BOOLEAN_FLAG.test(name) && !FIELD_ERROR.test(name);
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

interface IFormSource {
  hook: TSESTree.CallExpression;
  path: readonly string[];
}

function tracksValue(dependency: IFormSource, value: IFormSource) {
  return (
    dependency.hook === value.hook &&
    dependency.path.length > 0 &&
    dependency.path.every((part, index) => part === value.path[index])
  );
}

function initialValue(argument: TSESTree.Node | undefined) {
  if (argument?.type !== 'ArrowFunctionExpression' && argument?.type !== 'FunctionExpression')
    return argument;
  if (argument.body.type !== 'BlockStatement') return argument.body;
  const [statement] = argument.body.body;
  if (argument.body.body.length === 1 && statement?.type === 'ReturnStatement') return statement.argument;
  return argument;
}

type TOptions = [{ checkStateNames?: boolean }?];

export const noOverlayState: TSESLint.RuleModule<'overlayState' | 'formStateCopy', TOptions> = {
  defaultOptions: [{ checkStateNames: true }],
  meta: {
    type: 'problem',
    docs: { description: 'useState로 관리하는 오버레이 열림·요청 오류와 폼 상태 복제를 검사한다.' },
    schema: [
      {
        type: 'object',
        properties: { checkStateNames: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      formStateCopy: '폼 상태는 formState 또는 useFormState에서 직접 읽으세요.',
      overlayState:
        '열림 상태는 overlay.open과 시트 props로, 요청 오류는 useMutation의 error와 ErrorLink로 처리하세요.',
    },
  },
  create(context) {
    const checkStateNames = context.options[0]?.checkStateNames ?? true;
    const useStateNames = new Set(['useState']);
    const isUseState = (callee: TSESTree.Expression) => {
      if (callee.type === 'Identifier') return useStateNames.has(callee.name);
      return callee.type === 'MemberExpression' && ASTUtils.getPropertyName(callee) === 'useState';
    };

    const variableFor = (node: TSESTree.Identifier) =>
      ASTUtils.findVariable(context.sourceCode.getScope(node), node);

    function importedHook(callee: TSESTree.Node) {
      const binding = callee.type === 'MemberExpression' ? callee.object : callee;
      if (binding.type !== 'Identifier') return;
      const definition = variableFor(binding)?.defs[0];
      if (definition?.type !== 'ImportBinding' || definition.parent.type !== 'ImportDeclaration') return;
      const specifier = definition.node;
      const module = definition.parent.source.value;
      if (callee.type === 'MemberExpression' && specifier.type !== 'ImportSpecifier')
        return { module, name: ASTUtils.getPropertyName(callee) };
      if (callee.type === 'Identifier' && specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported;
        return { module, name: imported.type === 'Identifier' ? imported.name : imported.value };
      }
    }

    function propertySource(
      source: IFormSource | undefined,
      property: TSESTree.MemberExpression | TSESTree.Property,
    ) {
      if (!source) return;
      const name = ASTUtils.getPropertyName(property);
      if (name === null || (source.path.length === 0 && name !== 'formState')) return;
      return { hook: source.hook, path: [...source.path, name] };
    }

    function bindingSource(binding: TSESTree.Node): IFormSource | undefined {
      const parent = binding.parent;
      if (parent?.type === 'VariableDeclarator' && parent.id === binding) return formSource(parent.init);
      if (parent?.type === 'Property' && parent.value === binding && parent.parent.type === 'ObjectPattern')
        return propertySource(bindingSource(parent.parent), parent);
    }

    function formSource(node: TSESTree.Node | null | undefined): IFormSource | undefined {
      if (node?.type === 'CallExpression') {
        const hook = importedHook(node.callee);
        if (hook?.module === 'react-hook-form') {
          if (hook.name === 'useFormState') return { hook: node, path: ['formState'] };
          if (hook.name === 'useForm' || hook.name === 'useFormContext') return { hook: node, path: [] };
        }
        if (
          hook?.name === 'useZodForm' &&
          (hook.module === '@/shared/model/form' || hook.module === '@/shared/model')
        )
          return { hook: node, path: [] };
      }
      if (node?.type === 'MemberExpression') return propertySource(formSource(node.object), node);
      if (
        node?.type === 'ChainExpression' ||
        node?.type === 'TSAsExpression' ||
        node?.type === 'TSNonNullExpression'
      )
        return formSource(node.expression);
      if (node?.type === 'LogicalExpression' && node.operator === '??' && node.right.type === 'Literal')
        return formSource(node.left);
      if (node?.type === 'Identifier') {
        const definition = variableFor(node)?.defs[0];
        // 앞에서 선언한 const의 초기화만 추적해 재할당과 순환 별칭을 건너뛴다.
        if (
          definition?.type === 'Variable' &&
          definition.parent.kind === 'const' &&
          definition.node.range[1] <= node.range[0]
        )
          return bindingSource(definition.name);
      }
    }

    function formStateSource(node: TSESTree.Node | null | undefined) {
      const source = formSource(node);
      return source?.path.length ? source : undefined;
    }

    function syncedFormState(identifier: TSESTree.Identifier) {
      const call = identifier.parent;
      if (call.type !== 'CallExpression' || call.callee !== identifier) return;
      const source = formStateSource(call.arguments[0]);
      if (!source) return;

      const statement = call.parent;
      const block = statement.type === 'ExpressionStatement' ? statement.parent : undefined;
      const body = block?.type === 'BlockStatement' && block.body.length === 1 ? block : call;
      const callback = body.parent;
      if (
        (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression') ||
        callback.body !== body
      )
        return;
      const effect = callback.parent;
      if (effect.type !== 'CallExpression' || effect.arguments[0] !== callback) return;
      const hook = importedHook(effect.callee);
      if (hook?.module !== 'react' || (hook.name !== 'useEffect' && hook.name !== 'useLayoutEffect')) return;

      const dependencies = effect.arguments[1];
      if (!dependencies) return source;
      if (
        dependencies.type === 'ArrayExpression' &&
        dependencies.elements.some((element) => {
          const dependency = formStateSource(element);
          return dependency && tracksValue(dependency, source);
        })
      )
        return source;
    }

    function copiesFormState(call: TSESTree.CallExpression) {
      const declaration = call.parent;
      if (
        declaration.type !== 'VariableDeclarator' ||
        declaration.init !== call ||
        declaration.parent.kind !== 'const' ||
        declaration.id.type !== 'ArrayPattern'
      )
        return false;
      const hook = importedHook(call.callee);
      if (hook?.module !== 'react' || hook.name !== 'useState') return false;
      const [, setter] = declaration.id.elements;
      if (setter && setter.type !== 'Identifier') return false;

      const reads = setter
        ? (variableFor(setter)?.references.filter((reference) => reference.isRead()) ?? [])
        : [];
      const seed = initialValue(call.arguments[0]);
      const initial = formStateSource(seed);
      if (reads.length === 0) return Boolean(initial);
      const [read] = reads;
      if (reads.length !== 1 || read?.identifier.type !== 'Identifier') return false;

      const update = syncedFormState(read.identifier);
      if (!update) return false;
      const sameInitialValue =
        initial && initial.path.length === update.path.length && tracksValue(initial, update);
      const emptySeed =
        !seed ||
        seed.type === 'Literal' ||
        (seed.type === 'Identifier' && seed.name === 'undefined' && !variableFor(seed)?.defs.length);
      return emptySeed || Boolean(sameInitialValue);
    }

    return {
      ImportDeclaration(node) {
        if (!checkStateNames || node.source.value !== 'react') return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;
          const imported =
            specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
          if (imported === 'useState') useStateNames.add(specifier.local.name);
        }
      },
      CallExpression(node) {
        const state = stateIdentifier(node);
        if (!state) return;
        if (copiesFormState(node)) {
          context.report({ node: state, messageId: 'formStateCopy' });
          return;
        }
        if (
          checkStateNames &&
          isUseState(node.callee) &&
          isOverlayStateName(state.name.replace(/(?<=.)State$/, ''))
        )
          context.report({ node: state, messageId: 'overlayState' });
      },
    };
  },
};
