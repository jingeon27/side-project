import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { crop, fingerprint, loadCounterpushCards, matchCard } from '../../android/perception/vision.ts';
import { loadProfile } from '../../shared/config.ts';

// 기록한 한 프레임의 회색 손패다. 저장소에 거의 같은 회색 그림이 있어 다른 덮개 위치의 일반화는 보이지 않는다.
it('recognizes the grayed-out hand cards of a recorded frame and leaves a blank frame unknown', async () => {
  const profile = await loadProfile(
    fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
  );
  const templates = await loadCounterpushCards(profile);
  const image = await readFile(
    new URL('../../../test-fixtures/counterpush/disabled-hand.png', import.meta.url),
  );
  // 고정 이미지는 368×652 화면의 536행부터 잘라 두었다.
  const cards = await Promise.all(
    profile.hand.map(
      async (rect) =>
        matchCard(
          await fingerprint(await crop(image, { ...rect, y: rect.y - 536 })),
          templates,
          profile.thresholds.cardDistance,
          profile.thresholds.cardMargin,
        ).card,
    ),
  );
  expect(cards).toEqual(['goblin_hut', 'graveyard', 'furnace', 'poison']);
  expect(
    matchCard(Array(144).fill(150), templates, profile.thresholds.cardDistance, profile.thresholds.cardMargin)
      .card,
  ).toBeNull();
});
