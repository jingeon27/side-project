import { ASTUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

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

export function createFormStateCopyCheck(sourceCode: Readonly<TSESLint.SourceCode>) {
  const variableFor = (node: TSESTree.Identifier) => ASTUtils.findVariable(sourceCode.getScope(node), node);

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

  return function copiedFormState(call: TSESTree.CallExpression) {
    const declaration = call.parent;
    if (
      declaration.type !== 'VariableDeclarator' ||
      declaration.init !== call ||
      declaration.parent.kind !== 'const' ||
      declaration.id.type !== 'ArrayPattern'
    )
      return null;
    const hook = importedHook(call.callee);
    if (hook?.module !== 'react' || hook.name !== 'useState') return null;
    const [state, setter] = declaration.id.elements;
    if (state?.type !== 'Identifier' || (setter && setter.type !== 'Identifier')) return null;

    const reads = setter
      ? (variableFor(setter)?.references.filter((reference) => reference.isRead()) ?? [])
      : [];
    const seed = initialValue(call.arguments[0]);
    const initial = formStateSource(seed);
    if (reads.length === 0) return initial ? state : null;
    const [read] = reads;
    if (reads.length !== 1 || read?.identifier.type !== 'Identifier') return null;

    const update = syncedFormState(read.identifier);
    if (!update) return null;
    const sameInitialValue =
      initial && initial.path.length === update.path.length && tracksValue(initial, update);
    const emptySeed =
      !seed ||
      seed.type === 'Literal' ||
      (seed.type === 'Identifier' && seed.name === 'undefined' && !variableFor(seed)?.defs.length);
    return emptySeed || sameInitialValue ? state : null;
  };
}

export const noFormStateCopy: TSESLint.RuleModule<'formStateCopy', []> = {
  defaultOptions: [],
  meta: {
    type: 'problem',
    docs: { description: 'React Hook Form이 관리하는 값을 useState에 복제하지 않는다.' },
    schema: [],
    messages: { formStateCopy: '폼 상태는 formState 또는 useFormState에서 직접 읽으세요.' },
  },
  create(context) {
    const copiedFormState = createFormStateCopyCheck(context.sourceCode);
    return {
      CallExpression(node) {
        const state = copiedFormState(node);
        if (state) context.report({ node: state, messageId: 'formStateCopy' });
      },
    };
  },
};
