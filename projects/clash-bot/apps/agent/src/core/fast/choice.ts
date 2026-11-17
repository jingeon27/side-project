import { sumBy } from 'es-toolkit';

// 한 카드의 여러 위치에 나뉜 확률을 먼저 합친다. 대기·스킬은 각각 별개의 선택이다.
// 확률을 보정하거나 카드를 강제하지 않으며, Python policy.choice와 같은 결정을 한다.
export function cardChoice(families: readonly string[], probabilities: readonly number[]) {
  if (
    families.length === 0 ||
    probabilities.length !== families.length ||
    probabilities.some((value) => !Number.isFinite(value) || value < 0) ||
    sumBy(probabilities, (value) => value) <= 0
  )
    throw new Error('카드 선택의 후보와 확률이 맞지 않습니다.');
  const groups = new Map<string, number[]>();
  for (const [index, family] of families.entries()) {
    const indexes = groups.get(family);
    if (indexes) indexes.push(index);
    if (!indexes) groups.set(family, [index]);
  }
  const ranked = Array.from(groups.values()).map((indexes) => ({
    indexes,
    mass: sumBy(indexes, (index) => probabilities[index]!),
  }));
  const selected = ranked.reduce((best, group) => (group.mass > best.mass ? group : best));
  return selected.indexes.reduce((best, index) =>
    probabilities[index]! > probabilities[best]! ? index : best,
  );
}
