import { CARD_INFO, type CardId, type Point, type Profile } from './config.ts';
import type { BattleSituation } from './counterpush/battle-state.ts';

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
  }));

export function actionCandidates(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  threats: Point[],
  situation?: BattleSituation,
): QwenAction[] {
  const nearest = threats.toSorted((a, b) => b.y - a.y)[0];
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
  const own = (point: Point): Point => ({
    x: Math.max(profile.arena.x + 10, Math.min(profile.arena.x + profile.arena.width - 10, point.x)),
    y: Math.max(profile.riverY + 20, Math.min(profile.arena.y + profile.arena.height - 25, point.y)),
  });
  const moves = cards.flatMap((card, index) => {
    if (!card || CARD_INFO[card].cost > elixir) return [];
    const targets: Array<{ target: Point; description: string }> =
      card === 'graveyard'
        ? [95, 273]
            .filter(
              (x) =>
                !situation ||
                situation.own.units.some(
                  (ally) =>
                    ['knight', 'furnace'].includes(ally.card ?? '') &&
                    ally.confidence >= 0.85 &&
                    ally.y < profile.riverY + 65 &&
                    ally.x < 184 === x < 184,
                ) ||
                (threats.length === 0 && elixir >= 8 && situation.opponent.elixir.max <= 3),
            )
            .map((x) => ({
              target: { x, y: profile.arena.y + 45 },
              description: `graveyard on ${x < 184 ? 'left' : 'right'} enemy tower`,
            }))
        : card === 'goblin_hut'
          ? [184, 143, 225].map((x) => ({
              target: { x, y: profile.riverY + 65 },
              description: `${x === 184 ? 'center' : x < 184 ? 'left pull' : 'right pull'} defensive goblin hut`,
            }))
          : card === 'poison'
            ? [
                ...(poisonDefense && (!situation || (cluster?.length ?? 0) >= 3)
                  ? [{ target: own(poisonDefense), description: 'poison clustered invading enemy troops' }]
                  : []),
                ...[95, 273]
                  .filter(
                    (x) =>
                      !situation ||
                      situation.own.recentPlays.some(
                        (play) =>
                          play.card === 'graveyard' &&
                          situation.at - play.at < 12_000 &&
                          play.target.x < 184 === x < 184,
                      ) ||
                      situation.own.units.some(
                        (ally) =>
                          ally.y < profile.riverY - 30 && ally.confidence >= 0.85 && ally.x < 184 === x < 184,
                      ),
                  )
                  .map((x) => ({
                    target: { x, y: profile.arena.y + 45 },
                    description: `poison ${x < 184 ? 'left' : 'right'} enemy tower`,
                  })),
              ]
            : [
                ...((card === 'furnace' || card === 'ice_wizard') && situation
                  ? situation.own.units
                      .filter(
                        (ally) =>
                          ['knight', 'furnace'].includes(ally.card ?? '') &&
                          ally.confidence >= 0.85 &&
                          ally.y < profile.riverY + 80,
                      )
                      .toSorted((first, second) => first.y - second.y)
                      .slice(0, 1)
                      .map((ally) => ({
                        target: own({ x: ally.x, y: ally.y + 45 }),
                        description: `${card} behind advancing ${ally.card}`,
                      }))
                  : []),
                ...(nearest
                  ? [
                      {
                        target: own({
                          x: nearest.x,
                          y: nearest.y + (card === 'ice_wizard' || card === 'furnace' ? 45 : 18),
                        }),
                        description: `defend nearest threat with ${card}`,
                      },
                    ]
                  : []),
                ...[95, 273].map((x) => ({
                  target: own({
                    x,
                    y:
                      card === 'barbarian_barrel'
                        ? profile.riverY + 25
                        : profile.arena.y + profile.arena.height - 45,
                  }),
                  description: `${card} in ${x < 184 ? 'left' : 'right'} own lane`,
                })),
              ];
    return targets.map((item) => ({ slot: index + 1, card, ...item }));
  });
  const actions = moves.map((item, i) => ({ id: i + 1, ...item }));
  return (!nearest && elixir < 8) || actions.length === 0
    ? [
        { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait and save elixir' },
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
    `Card knowledge: ${JSON.stringify(deckGuidance(cards.filter((card): card is CardId => card !== null)))}. ` +
    (format === 'letter'
      ? 'Reply with exactly ONE action letter, no explanation.'
      : 'Return ONLY {"choice":ACTION_ID}.') +
    (situation
      ? ` Both players regenerate equally and cap at 10; overflow is lost. A deck has 8 cards, 4 in hand and a 4-card FIFO draw queue; a played card returns after 4 subsequent plays. Use enemy elixir ranges and cycle hypotheses as partial estimates. Current field state: ${JSON.stringify(situation)}.`
      : '');
  return `You play BLUE bottom in Clash Royale. Enemy RED top. Current hand left to right: ${cards.join(', ')}. Elixir=${elixir}. Invading enemy positions in 368x652 coordinates: ${JSON.stringify(threats)}. Choose the best ONE action from this legal list. Defend the lane under attack first; use cheap defense, support with ice wizard and furnace, a walking ranged troop that spawns fire spirits; build goblin hut in center. On counterattack use graveyard on the same enemy tower as advancing allies and poison enemy defenders. Do not wait at full elixir. ${reply} Actions: ${JSON.stringify(actions.map((a, i) => ({ id: format === 'letter' ? String.fromCharCode(65 + i) : a.id, card: a.card, description: a.description, target: a.target })))}.`;
}
