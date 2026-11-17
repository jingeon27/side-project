import { CARD_INFO, type CardId } from '../cards.ts';

const clamp = (amount: number) => Math.max(0, Math.min(10, amount));
export class ElixirLedger {
  readonly samples: Array<{ at: number; amount: number; range?: { min: number; max: number } }> = [];
  readonly own: Array<{ at: number; card: CardId; cost: number; kind: 'card' | 'ability' }> = [];
  readonly opponent: Array<{ earliest: number; latest: number; card: CardId | null; cost: number }> = [];
  observeOwn(at: number, amount: number, range?: { min: number; max: number }) {
    this.samples.push({ at, amount: clamp(amount), range });
  }
  spendOwn(at: number, card: CardId) {
    this.own.push({ at, card, cost: CARD_INFO[card].cost, kind: 'card' });
  }
  spendOwnAbility(at: number) {
    this.own.push({ at, card: 'ice_wizard', cost: 2, kind: 'ability' });
  }
  spendOpponent(earliest: number, latest: number, card: CardId) {
    this.opponent.push({ earliest, latest, card, cost: CARD_INFO[card].cost });
  }
  observeOpponentSpend(earliest: number, latest: number, cost: number) {
    if (
      !Number.isFinite(earliest) ||
      !Number.isFinite(latest) ||
      earliest > latest ||
      !Number.isFinite(cost) ||
      cost < 1 ||
      cost > 11
    )
      throw new Error('관측한 상대 지출의 시간·비용 범위가 올바르지 않습니다.');
    this.opponent.push({ earliest, latest, card: null, cost });
  }
  snapshot(at: number) {
    const samples = this.samples.filter((sample) => sample.at <= at);
    const first = samples[0];
    if (!first)
      return {
        own: { min: 0, max: 10 },
        opponent: { min: 0, max: 10 },
        ownSpent: 0,
        opponentSeenSpent: 0,
        ownLeakUpper: 0,
        coverage: 'partial' as const,
      };
    const result = samples.slice(1).reduce(
      (state, sample) => {
        const ownSpent = this.own
          .filter((play) => play.at > state.previous.at && play.at <= sample.at)
          .reduce((sum, play) => sum + play.cost, 0);
        const observableGain = sample.amount - state.previous.amount + ownSpent;
        // At our cap, shared regeneration cannot be reconstructed from the bar.
        // Keep a conservative upper bound, rather than crediting overflow as usable elixir.
        const leakUpper =
          state.leakUpper +
          (sample.amount >= 9.75 || state.previous.amount >= 9.75
            ? Math.max(0, ((sample.at - state.previous.at) / 1000) * (3 / 2.8) - Math.max(0, observableGain))
            : 0);
        const totalOwnSpent = state.ownSpent + ownSpent;
        const sharedUpper = Math.max(
          state.sharedUpper,
          (sample.range?.max ?? sample.amount + 0.2) +
            totalOwnSpent +
            leakUpper -
            (first.range?.min ?? first.amount),
        );
        const cost = this.opponent
          .filter((play) => play.earliest + 0.001 > state.previous.at && play.earliest + 0.001 <= sample.at)
          .reduce((sum, play) => sum + play.cost, 0);
        return {
          previous: sample,
          ownSpent: totalOwnSpent,
          sharedUpper,
          leakUpper,
          enemyUpper: clamp(Math.max(0, state.enemyUpper - cost) + sharedUpper - state.sharedUpper),
        };
      },
      {
        previous: first,
        ownSpent: 0,
        sharedUpper: 0.2,
        leakUpper: 0,
        enemyUpper: clamp(first.range?.max ?? first.amount + 0.2),
      },
    );
    return {
      own: result.previous.range ?? {
        min: clamp(result.previous.amount - 0.2),
        max: clamp(result.previous.amount + 0.2),
      },
      opponent: { min: 0, max: result.enemyUpper },
      ownSpent: result.ownSpent,
      opponentSeenSpent: this.opponent
        .filter((play) => play.latest <= at)
        .reduce((sum, play) => sum + play.cost, 0),
      ownLeakUpper: result.leakUpper,
      coverage: 'partial' as const,
    };
  }
}
