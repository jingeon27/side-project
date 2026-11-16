import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

export interface IQueryCostLimits {
  /** 조각을 펼친 뒤 연산 하나에서 실행하는 필드 수 */
  maxFields: number;
  /** 같은 필드를 다른 인자로 여러 번 부르게 하는 alias 수 */
  maxAliases: number;
}

interface IQueryCost {
  fields: number;
  aliases: number;
}

export const QUERY_COST_MESSAGE = {
  FIELDS: '한 번에 요청한 필드가 너무 많습니다.',
  ALIASES: '한 번에 요청한 별칭(alias)이 너무 많습니다.',
} as const satisfies Record<string, string>;

/**
 * 조각(fragment)을 펼쳐 필드·alias를 센다. 조각을 겹쳐 쓰면 펼친 크기가 기하급수로 커지므로
 * 상한을 넘는 순간 세기를 멈춘다. 순환 조각은 NoFragmentCycles 규칙이 따로 거절한다.
 */
function exceeds(
  context: ValidationContext,
  selectionSet: SelectionSetNode,
  cost: IQueryCost,
  limits: IQueryCostLimits,
  visiting: Set<string>,
): boolean {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      cost.fields += 1;
      if (selection.alias) cost.aliases += 1;
      if (cost.fields > limits.maxFields || cost.aliases > limits.maxAliases) return true;
      if (selection.selectionSet && exceeds(context, selection.selectionSet, cost, limits, visiting))
        return true;
      continue;
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (exceeds(context, selection.selectionSet, cost, limits, visiting)) return true;
      continue;
    }
    const name = selection.name.value;
    const fragment = context.getFragment(name);
    if (!fragment || visiting.has(name)) continue;
    visiting.add(name);
    const over = exceeds(context, fragment.selectionSet, cost, limits, visiting);
    visiting.delete(name);
    if (over) return true;
  }
  return false;
}

/**
 * depth 제한만으로는 alias 수천 개나 넓은 선택으로 요청 하나가 수많은 DB 조회를 일으키는 것을 막지 못한다.
 * 연산마다 펼친 필드 수와 alias 수에 상한을 둔다.
 */
export function queryCostLimit(limits: IQueryCostLimits): ValidationRule {
  return (context: ValidationContext): ASTVisitor => ({
    OperationDefinition(node) {
      const cost: IQueryCost = { fields: 0, aliases: 0 };
      if (!exceeds(context, node.selectionSet, cost, limits, new Set())) return;
      const message =
        cost.aliases > limits.maxAliases ? QUERY_COST_MESSAGE.ALIASES : QUERY_COST_MESSAGE.FIELDS;
      context.reportError(new GraphQLError(message, { nodes: [node] }));
    },
  });
}
