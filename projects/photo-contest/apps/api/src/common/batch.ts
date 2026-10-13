/**
 * 같은 목록에서 나온 형제 노드들이 처음 요청될 때 한 번에 불러오도록 결과를 공유한다.
 * GraphQL 목록의 항목마다 필드 리졸버가 따로 조회하면 N+1이 되기 때문이다.
 */
export function siblingLoader<TKey, TValue>(
  keys: readonly TKey[],
  load: (keys: readonly TKey[]) => Promise<Map<TKey, TValue>>,
  fallback: TValue,
) {
  let pending: Promise<Map<TKey, TValue>> | undefined;
  return async function loadSibling(key: TKey): Promise<TValue> {
    pending ??= load(keys);
    return (await pending).get(key) ?? fallback;
  };
}

/** 배열을 키별 Map으로 묶는다. 입력 순서를 유지한다. */
export function groupBy<TItem, TKey>(items: readonly TItem[], keyOf: (item: TItem) => TKey) {
  const groups = new Map<TKey, TItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
