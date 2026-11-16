import { expect, it } from 'vitest';

import { loadHandReferences } from './hand-references.ts';
import { fingerprint, matchCard } from './hand.ts';

// 라벨이 맞지만 회색 카드 위 밝은 덮개가 그림보다 지문을 크게 바꿔, 같은 프레임의 다른 회색 카드와 더 가까운 그림이다.
// 인식 약점의 기록이며 허용 기준이 아니다. 참조를 추가하거나 비교 방식을 바꾸면 이 목록도 함께 확인한다.
const GRAY_LOOKALIKES = [
  'variants/furnace/disabled-0.png -> goblin_hut',
  'variants/furnace/disabled-1.png -> goblin_hut',
  'variants/goblin_hut/disabled-0.png -> furnace',
  'variants/goblin_hut/disabled-1.png -> furnace',
  'variants/graveyard/disabled-2.png -> furnace',
];

// 회색 독 그림이 고블린 오두막으로 등록됐던 오류는 이 그림이 다른 회색 독 그림과 가장 가깝다는 것으로 드러난다.
it('finds every repository hand image nearest to its own card, apart from the recorded gray lookalikes', async () => {
  const references = await Promise.all(
    (await loadHandReferences()).references.map(async (reference) => ({
      path: reference.path,
      card: reference.card,
      state: reference.state,
      fingerprint: await fingerprint(reference.bytes),
    })),
  );
  const suspects = references.flatMap((reference) => {
    const others = references.filter((other) => other !== reference);
    // 같은 모습의 다른 그림이 있는 카드만 비교한다. 단 하나뿐인 진화·일반 그림은 가까운 짝이 없다.
    if (!others.some((other) => other.card === reference.card && other.state === reference.state)) return [];
    const nearest = matchCard(reference.fingerprint, others, Infinity, 0).card;
    return nearest === reference.card ? [] : [`${reference.path} -> ${nearest}`];
  });
  expect(suspects).toEqual(GRAY_LOOKALIKES);
});
