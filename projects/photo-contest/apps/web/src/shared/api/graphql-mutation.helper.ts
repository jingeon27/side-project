import {
  getOperationAST,
  Kind,
  OperationTypeNode,
  parse,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from 'graphql';

export interface IGraphqlMutation {
  firstResponseKey: string | null;
}

export function graphqlMutation(body: unknown): IGraphqlMutation | null {
  if (!body || typeof body !== 'object' || !('query' in body) || typeof body.query !== 'string') return null;
  try {
    const name =
      'operationName' in body && typeof body.operationName === 'string' ? body.operationName : undefined;
    const document = parse(body.query);
    const operation = getOperationAST(document, name);
    if (operation?.operation !== OperationTypeNode.MUTATION) return null;
    const fragments = new Map(
      document.definitions
        .filter((node): node is FragmentDefinitionNode => node.kind === Kind.FRAGMENT_DEFINITION)
        .map((node) => [node.name.value, node]),
    );
    return { firstResponseKey: firstResponseKey(operation.selectionSet, fragments, new Set()) };
  } catch {
    return null;
  }
}

function firstResponseKey(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  seen: Set<string>,
): string | null {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) return selection.alias?.value ?? selection.name.value;
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      const key = firstResponseKey(selection.selectionSet, fragments, seen);
      if (key) return key;
      continue;
    }
    if (seen.has(selection.name.value)) continue;
    seen.add(selection.name.value);
    const fragment = fragments.get(selection.name.value);
    if (!fragment) continue;
    const key = firstResponseKey(fragment.selectionSet, fragments, seen);
    if (key) return key;
  }
  return null;
}

export function mutationChangedData(mutation: IGraphqlMutation, result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  if ('data' in result && result.data && typeof result.data === 'object')
    if (Object.values(result.data).some((value) => value !== null && value !== undefined)) return true;
  if (!('errors' in result) || !Array.isArray(result.errors)) return false;
  // 앞선 mutation이 커밋된 뒤 다음 non-null 필드가 실패하면 GraphQL은 data 전체를 null로 돌려준다.
  return result.errors.some((error: unknown) => {
    if (!error || typeof error !== 'object' || !('path' in error) || !Array.isArray(error.path)) return false;
    return error.path.length > 1 || (error.path.length > 0 && error.path[0] !== mutation.firstResponseKey);
  });
}
