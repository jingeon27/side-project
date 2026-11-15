import { CARD_INFO, type CardId, type Point, type Profile } from './config.ts';
import type { BattleSituation } from './counterpush/battle-state.ts';
import { KNOWLEDGE_VERSION, mechanicSummary } from './game-knowledge.ts';
import { graveyardThreat, ownPoint, unitPlacements, type PlacementOption } from './placement.ts';
import { policyContext } from './policy-context.ts';

export type QwenAction = {
  id: number;
  slot: number;
  card: CardId | null;
  target: Point;
  description: string;
};

const CARD_TACTICS: Partial<Record<CardId, string>> = {
  knight: 'Ground tank: absorb damage and protect ranged support before a counterattack.',
  barbarian_barrel: 'Roll toward ground swarms and leave a Barbarian; does not answer air troops.',
  skeletons: 'Cheap ground distraction and cycle; vulnerable to splash damage.',
  graveyard: 'Attack an enemy tower while an ally tanks; react to visible defenders.',
  poison: 'Area damage for clustered defenders or to support Graveyard in the SAME lane.',
  goblin_hut: 'Defensive pull and Spear Goblin pressure over time.',
  furnace:
    'Walking ranged support that spawns Fire Spirits; protect it rather than treating it as a building.',
  ice_wizard: 'Ranged slowing support behind a tank; hero ability state and exact ranges are unverified.',
};

export const deckGuidance = (cards: CardId[]) =>
  cards.map((card) => ({
    card,
    cost: CARD_INFO[card].cost,
    tactics: CARD_TACTICS[card] ?? CARD_INFO[card].role,
    mechanics: mechanicSummary(card),
  }));

export function actionCandidates(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  threats: Point[],
  situation?: BattleSituation,
): QwenAction[] {
  const nearest = threats.toSorted((a, b) => b.y - a.y)[0];
  const graveyard = graveyardThreat(profile, situation);
  const cluster = threats
    .map((point) => threats.filter((other) => Math.hypot(other.x - point.x, other.y - point.y) <= 60))
    .toSorted((first, second) => second.length - first.length)[0];
  const poisonDefense =
    situation && cluster?.length
      ? {
          x: cluster.reduce((sum, point) => sum + point.x, 0) / cluster.length,
          y: cluster.reduce((sum, point) => sum + point.y, 0) / cluster.length,
        }
      : nearest;
  const enemyTower = (x: number) => ({ x, y: profile.arena.y + 60 });
  const supported = (x: number) =>
    !situation ||
    situation.own.units.some(
      (ally) =>
        ['knight', 'furnace'].includes(ally.card ?? '') &&
        ally.confidence >= 0.85 &&
        ally.y < profile.riverY + 65 &&
        ally.x < 184 === x < 184,
    ) ||
    (threats.length === 0 && elixir >= 8 && situation.opponent.elixir.max <= 3);
  const recentGraveyards =
    situation?.own.recentPlays.filter(
      (play) => play.card === 'graveyard' && situation.at - play.at < 12_000,
    ) ?? [];
  const moves = cards.flatMap((card, index) => {
    if (!card || CARD_INFO[card].cost > elixir) return [];
    const targets: PlacementOption[] =
      card === 'graveyard'
        ? [95, 273]
            .filter(supported)
            .flatMap((x) => [
              {
                target: enemyTower(x),
                description: `Graveyard ${x < 184 ? 'left' : 'right'} tower center with advancing support`,
              },
              {
                target: { x: x + (x < 184 ? -20 : 20), y: profile.arena.y + 70 },
                description: 'Graveyard outer offset; consider fixed spawn order and defenders',
              },
              {
                target: { x, y: profile.arena.y + 85 },
                description: 'Graveyard forward offset; compare defenders and tank arrival',
              },
            ])
            .slice(0, 5)
        : card === 'poison'
          ? [
              ...(graveyard &&
              !situation?.own.recentPlays.some(
                (play) =>
                  play.card === 'poison' &&
                  situation.at - play.at < 6000 &&
                  Math.hypot(play.target.x - graveyard.x, play.target.y - graveyard.y) < 45,
              )
                ? [
                    {
                      target: { x: graveyard.x, y: graveyard.y },
                      description:
                        'defensive Poison covering active Graveyard; compare remaining spawn phase, 8s Poison and 9s Graveyard reference durations',
                    },
                  ]
                : []),
              ...(poisonDefense && (!situation || (cluster?.length ?? 0) >= 3)
                ? [
                    {
                      target: ownPoint(profile, card, poisonDefense)!,
                      description: 'Poison clustered invading troops',
                    },
                  ].filter((item) => item.target)
                : []),
              ...recentGraveyards.flatMap((play) => {
                const defender = situation!.opponent.units
                  .filter(
                    (unit) =>
                      unit.confidence >= 0.75 &&
                      Math.hypot(unit.x - play.target.x, unit.y - play.target.y) < 95,
                  )
                  .toSorted((first, second) => second.confidence - first.confidence)[0];
                return [
                  { target: play.target, description: 'Poison support on the active Graveyard location' },
                  ...(defender
                    ? [
                        {
                          target: { x: defender.x, y: defender.y },
                          description: `Poison observed ${defender.kind ?? defender.card ?? 'defender'} near Graveyard`,
                        },
                      ]
                    : []),
                ];
              }),
              ...(situation?.opponent.units
                .filter(
                  (unit) =>
                    ['furnace', 'goblin_hut', 'ice_wizard'].includes(unit.card ?? '') &&
                    unit.confidence >= 0.85 &&
                    situation.own.units.some((ally) => Math.hypot(ally.x - unit.x, ally.y - unit.y) < 110),
                )
                .slice(0, 1)
                .map((unit) => ({
                  target: { x: unit.x, y: unit.y },
                  description:
                    'Poison supporting defenders/spawner engaged with our troops; compare travel speed and remaining exposure',
                })) ?? []),
              ...(!situation
                ? [95, 273].map((x) => ({ target: enemyTower(x), description: 'Poison enemy tower' }))
                : []),
            ].slice(0, 5)
          : CARD_INFO[card].role === 'spell' && card !== 'barbarian_barrel'
            ? nearest
              ? [{ target: nearest, description: `${card} invading troops` }]
              : [95, 273].map((x) => ({ target: enemyTower(x), description: `${card} enemy tower` }))
            : unitPlacements(profile, card, threats, situation);
    const adjusted = targets.map((item) =>
      item.target.x > 306 && item.target.y > 454
        ? { ...item, target: { x: item.target.x - 40, y: item.target.y } }
        : item,
    );
    const unique = new Map(
      adjusted.map((item) => [`${Math.round(item.target.x)}:${Math.round(item.target.y)}`, item]),
    );
    return [...unique.values()]
      .filter(
        (item) =>
          item.target.x >= profile.arena.x &&
          item.target.x < profile.arena.x + profile.arena.width &&
          item.target.y >= profile.arena.y &&
          item.target.y < profile.arena.y + profile.arena.height,
      )
      .map((item) => ({ slot: index + 1, card, ...item }));
  });
  const actions = moves.map((item, index) => ({ id: index + 1, ...item }));
  return ((!nearest || graveyard) && elixir < 8) || actions.length === 0
    ? [
        {
          id: 0,
          slot: 0,
          card: null,
          target: { x: 0, y: 0 },
          description: 'wait and observe elixir/spawn timing',
        },
        ...actions,
      ]
    : actions;
}

export function choicePrompt(
  cards: Array<CardId | null>,
  elixir: number,
  threats: Point[],
  actions: QwenAction[],
  format: 'json' | 'letter' = 'json',
  situation?: BattleSituation,
): string {
  const reply =
    `Mechanics ${KNOWLEDGE_VERSION} are level-11 Clash Royale reference values, not fully calibrated Counterpush physics. Engine speed is NOT tiles/sec. Use measured pixel velocities and observed variants; an unknown variant grants no assumed evolution/hero bonus. Spawner children do not cost another card. Compare arrival, deploy/first-hit delay, range and splash. Graveyard has a fixed order; predictions are uncertain first-visibility estimates only after repeated casts. ` +
    `Card knowledge: ${JSON.stringify(deckGuidance(cards.filter((card): card is CardId => card !== null)))}. ` +
    (format === 'letter'
      ? 'Reply with exactly ONE action letter, no explanation.'
      : 'Return ONLY {"choice":ACTION_ID}.') +
    (situation
      ? ` Both players regenerate equally and cap at 10; overflow is lost. A deck has 8 cards, 4 in hand and a 4-card FIFO draw queue; a played card returns after 4 subsequent plays. Use enemy elixir ranges and cycle hypotheses as partial estimates. Current field state: ${JSON.stringify(policyContext(situation))}.`
      : '');
  return `You play BLUE bottom in Clash Royale. Enemy RED top. Current hand left to right: ${cards.join(', ')}. Elixir=${elixir}. Invading enemy positions in 368x652 coordinates: ${JSON.stringify(threats)}. Choose the best ONE action from this legal list. Compare timely defense, forward pressure and patient buildup. Use unit speed, deploy/first-hit delay, attack range, splash, child spawns and visible hazards. Keep ranged support behind protection; place spawners where their children can reach relevant targets. Under Graveyard, consider the observed spawn phase and Poison overlap; a single melee unit or Barrel does not guarantee full coverage. Counterattack Graveyard needs tank arrival and a placement that accounts for defenders. Do not wait at full elixir. ${reply} Actions: ${JSON.stringify(actions.map((a, i) => ({ id: format === 'letter' ? String.fromCharCode(65 + i) : a.id, card: a.card, description: a.description, target: a.target })))}.`;
}
