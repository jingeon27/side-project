import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type CardId } from '../../shared/config.ts';
import { COUNTERPUSH_DECK } from '../runtime/browser.ts';

// 확인된 경기 결과를 집계 칸으로 옮긴다. 그 밖의 결과는 unknown으로 센다.
const RESULT_COUNTERS: Record<string, 'wins' | 'losses' | 'draws'> = {
  win: 'wins',
  loss: 'losses',
  draw: 'draws',
};

type Event = {
  type: string;
  confirmed?: boolean;
  action?: { card: CardId };
  observation?: { id: string; card: CardId; situation?: unknown };
};
type Training = {
  opponent?: { updated: boolean; observations?: unknown };
  dataset?: { path: string } | null;
};
export const emptyCardCoverage = () =>
  Object.fromEntries(
    COUNTERPUSH_DECK.map((card) => [
      card,
      {
        ownConfirmed: 0,
        opponentRecognized: 0,
        withBeforeState: 0,
        selectedForTraining: 0,
        opponentTrained: 0,
      },
    ]),
  ) as Record<
    CardId,
    {
      ownConfirmed: number;
      opponentRecognized: number;
      withBeforeState: number;
      selectedForTraining: number;
      opponentTrained: number;
    }
  >;

export function episodeCoverage(
  events: Event[],
  selected: Array<{ id: string; card: CardId }>,
  trained: { updated: boolean; observations?: unknown } = { updated: false },
) {
  const cards = emptyCardCoverage();
  for (const event of events) {
    if (event.type === 'input_check' && event.action && cards[event.action.card] && event.confirmed === true)
      cards[event.action.card].ownConfirmed++;
    if (event.type === 'opponent_action' && event.observation && cards[event.observation.card]) {
      cards[event.observation.card].opponentRecognized++;
      if (event.observation.situation) cards[event.observation.card].withBeforeState++;
    }
  }
  const trainedIds = new Set(
    trained.updated && Array.isArray(trained.observations)
      ? trained.observations.flatMap((item) => (typeof item?.id === 'string' ? [item.id] : []))
      : [],
  );
  for (const sample of selected) {
    if (!cards[sample.card]) continue;
    cards[sample.card].selectedForTraining++;
    if (trainedIds.has(sample.id)) cards[sample.card].opponentTrained++;
  }
  return cards;
}

export async function readEpisodeCoverage(directory: string, training?: Training) {
  const events = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Event);
  const selected = training?.dataset?.path
    ? (
        JSON.parse(await readFile(training.dataset.path, 'utf8')) as {
          samples: Array<{ id: string; card: CardId }>;
        }
      ).samples
    : [];
  return episodeCoverage(events, selected, training?.opponent);
}

export async function learningAudit(dataDir: string, since?: string) {
  const text = await readFile(join(dataDir, 'counterpush/control/matches.jsonl'), 'utf8').catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  });
  const matches = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          directory: string;
          result: string;
          at: string;
          training?: Training & { policy?: Record<string, unknown> };
        },
    )
    .filter((match) => !since || match.at >= since);
  const cards = emptyCardCoverage();
  const results = { wins: 0, losses: 0, draws: 0, unknown: 0 };
  const abilities = { ice_wizard: { attempted: 0, confirmed: 0, opponentAvailability: 'unobserved' } };
  for (const match of matches) {
    const coverage = await readEpisodeCoverage(match.directory, match.training);
    for (const card of COUNTERPUSH_DECK)
      for (const key of Object.keys(cards[card]) as Array<keyof (typeof cards)[typeof card]>)
        cards[card][key] += coverage[card][key];
    const summary = JSON.parse(await readFile(join(match.directory, 'summary.json'), 'utf8')) as {
      abilityActions?: number;
      abilityConfirmed?: number;
    };
    abilities.ice_wizard.attempted += summary.abilityActions ?? 0;
    abilities.ice_wizard.confirmed += summary.abilityConfirmed ?? 0;
    results[RESULT_COUNTERS[match.result] ?? 'unknown']++;
  }
  return {
    since: since ?? null,
    completedMatches: matches.length,
    results,
    cards,
    abilities,
    improvement: 'unproven',
    meaning: 'Recognition and weight updates do not establish better play.',
  };
}

export async function activeOpponentCoverage(dataDir: string, policy: Record<string, unknown>) {
  const requested = new Set(
    Array.isArray(policy.demonstrations)
      ? policy.demonstrations.filter((value): value is string => typeof value === 'string')
      : [],
  );
  const found = new Set<string>();
  const cards = Object.fromEntries(COUNTERPUSH_DECK.map((card) => [card, 0])) as Record<CardId, number>;
  const root = join(dataDir, 'counterpush/datasets');
  const directories = await readdir(root, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const bytes = await readFile(join(root, directory.name, 'dataset.json')).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (!bytes) continue;
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!requested.has(hash) || found.has(hash)) continue;
    found.add(hash);
    const dataset = JSON.parse(bytes.toString('utf8')) as { samples: Array<{ card: CardId }> };
    for (const sample of dataset.samples) if (sample.card in cards) cards[sample.card]++;
  }
  return {
    policyVersion: policy.version,
    datasets: found.size,
    unresolvedDatasets: requested.size - found.size,
    samples: Object.values(cards).reduce((sum, count) => sum + count, 0),
    cards,
    improvement: 'unproven',
  };
}
