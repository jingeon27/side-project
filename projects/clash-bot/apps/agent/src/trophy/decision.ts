import { CARD_INFO, type CardId, type Point, type Profile } from '../config.ts';
import { tilePoint } from '../counterpush/policy/decision-v2.ts';
import { serializeDecision, type DecisionContext } from '../counterpush/policy/decision-v3.ts';
import type { QwenAction } from '../qwen-actions.ts';

export function trophyPrompt(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  actions: QwenAction[],
  threats: Point[],
) {
  const point = (value: Point): [number, number] => {
    const [x, y] = tilePoint(profile, value);
    return [x!, y!];
  };
  const context: DecisionContext = {
    hand: cards,
    elixir,
    enemyElixir: { min: 0, max: 10 },
    own: [],
    enemy: threats.slice(0, 8).map((body) => ['unknown', ...point(body), 'unknown']),
    actions: actions.map((action, index) => [
      String.fromCharCode(65 + index),
      action.kind ?? (action.card ? 'card' : 'wait'),
      action.card,
      action.cost ?? (action.card ? CARD_INFO[action.card].cost : 0),
      ...point(action.target),
    ]),
  };
  return serializeDecision(context);
}
