import { describe, expect, it } from 'vitest';

import { catalogueCard } from './card-catalogue.ts';
import { CARD_INFO } from './cards.ts';
import { COUNTERPUSH_DECK } from './deck.ts';

describe('the live deck costs what the simulator charges', () => {
  // 실전 장부는 CARD_INFO의 비용을, 자가대국은 엔진 수치표로 만든 카탈로그의 비용을 쓴다.
  // 밸런스 패치로 카탈로그를 다시 만들었을 때 한쪽만 바뀌면 여기서 드러난다.
  it.each(COUNTERPUSH_DECK.map((card) => [card] as const))('%s', (card) => {
    expect(catalogueCard(card)?.elixir).toBe(CARD_INFO[card].cost);
  });
});
