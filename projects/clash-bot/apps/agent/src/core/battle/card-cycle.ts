import type { CardId } from '../cards.ts';

type CycleState = { hand: CardId[]; queue: CardId[] };
const permutations = (cards: CardId[]): CardId[][] =>
  cards.length === 0
    ? [[]]
    : cards.flatMap((card, index) =>
        permutations(cards.filter((_, other) => other !== index)).map((rest) => [card, ...rest]),
      );
const combinations = (cards: CardId[], size: number): CardId[][] =>
  size === 0
    ? [[]]
    : cards.flatMap((card, index) =>
        combinations(cards.slice(index + 1), size - 1).map((rest) => [card, ...rest]),
      );
const uniqueStates = (states: CycleState[]) => [
  ...new Map(
    states.map((state) => [`${state.hand.toSorted().join(',')}|${state.queue.join(',')}`, state]),
  ).values(),
];
const advance = (state: CycleState, card: CardId): CycleState => ({
  hand: [...state.hand.filter((item) => item !== card), state.queue[0]!],
  queue: [...state.queue.slice(1), card],
});

export class CardCycle {
  readonly states: CycleState[];
  readonly flags = { missed: false, resynced: false };
  constructor(readonlyDeck: CardId[], hand?: CardId[], queue?: CardId[]) {
    if (readonlyDeck.length !== 8 || new Set(readonlyDeck).size !== 8)
      throw new Error('카드 순환은 서로 다른 8장으로 구성합니다.');
    const hands = hand ? [hand] : combinations(readonlyDeck, 4);
    this.states = hands.flatMap((initial) =>
      (queue ? [queue] : permutations(readonlyDeck.filter((card) => !initial.includes(card)))).map(
        (pending) => ({ hand: [...initial], queue: [...pending] }),
      ),
    );
    if (
      this.states.some(
        (state) =>
          state.hand.length !== 4 ||
          state.queue.length !== 4 ||
          new Set([...state.hand, ...state.queue]).size !== 8,
      )
    )
      throw new Error('손패 4장과 대기 큐 4장이 필요합니다.');
  }
  play(card: CardId, mayHaveMissed = false) {
    const possible = mayHaveMissed
      ? [0, 1, 2, 3].reduce(
          (states) =>
            uniqueStates([
              ...states,
              ...states.flatMap((state) => state.hand.map((item) => advance(state, item))),
            ]),
          this.states,
        )
      : this.states;
    const next = uniqueStates(
      possible.filter((state) => state.hand.includes(card)).map((state) => advance(state, card)),
    );
    if (!next.length)
      throw new Error('관찰한 카드가 추적 중인 손패에 없습니다. 놓친 행동이나 인식 오류입니다.');
    this.states.splice(0, this.states.length, ...next);
    this.flags.missed ||= mayHaveMissed;
  }
  observeHand(cards: Array<CardId | null>) {
    const known = cards.filter((card): card is CardId => card !== null);
    if (new Set(known).size !== known.length) return false;
    const next = this.states.filter((state) => known.every((card) => state.hand.includes(card)));
    if (!next.length) return false;
    this.states.splice(0, this.states.length, ...next);
    return true;
  }
  snapshot() {
    const cards = [...new Set(this.states.flatMap((state) => [...state.hand, ...state.queue]))];
    return {
      exact: this.states.length === 1 && !this.flags.missed,
      mayHaveMissed: this.flags.missed,
      hypotheses: this.states.length,
      couldHold: cards.filter((card) => this.states.some((state) => state.hand.includes(card))),
      nextDraw: [...new Set(this.states.map((state) => state.queue[0]!))],
      returnsAfterPlays: Object.fromEntries(
        cards.map((card) => {
          const waits = this.states.map((state) =>
            state.hand.includes(card) ? 0 : state.queue.indexOf(card) + 1,
          );
          return [card, { min: Math.min(...waits), max: Math.max(...waits) }];
        }),
      ),
    };
  }
}
