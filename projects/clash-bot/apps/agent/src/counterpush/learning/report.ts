import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { countBy, groupBy, meanBy, median, sumBy } from 'es-toolkit';
import { z } from 'zod';

import type { Profile } from '../../core/profile.ts';
import { readJsonFile, readOptionalJsonFile } from '../../shared/json-file.ts';
import { analyzeEpisode, lossAnalysisSchema, type LossAnalysis } from './loss-analysis.ts';

const summarySchema = z.looseObject({ seenBattle: z.boolean(), result: z.string() });
const round = (value: number) => Math.round(value * 100) / 100;
const medianOf = (values: Array<number | null>) => {
  const known = values.filter((value) => value !== null);
  return known.length ? median(known) : null;
};

// 판단 계약과 정책 버전마다 실력과 실수가 어떻게 바뀌는지 모은다. 승패만이 아니라 패배 원인의 추이를 본다.
function summarize(analyses: LossAnalysis[]) {
  const inputs = sumBy(analyses, (item) => item.inputs.confirmed + item.inputs.unconfirmed);
  return {
    matches: analyses.length,
    results: countBy(analyses, (item) => item.result),
    crowns: {
      own: round(meanBy(analyses, (item) => item.crowns.own)),
      enemy: round(meanBy(analyses, (item) => item.crowns.enemy)),
    },
    perMatch: {
      fullElixirSeconds: round(meanBy(analyses, (item) => item.elixir.fullSeconds)),
      waitedAtFull: round(meanBy(analyses, (item) => item.elixir.waitedAtFull)),
      undefendedAttacks: round(meanBy(analyses, (item) => item.attacks.undefended)),
      waitedUnderAttack: round(meanBy(analyses, (item) => item.attacks.waitedUnderAttack)),
    },
    reactionMedianMs: medianOf(analyses.map((item) => item.attacks.reactionMedianMs)),
    unconfirmedInputRate: inputs ? round(sumBy(analyses, (item) => item.inputs.unconfirmed) / inputs) : null,
    decisionMedianMs: medianOf(analyses.map((item) => item.latency.decisionMedianMs)),
  };
}

export async function learningReport(dataDir: string, profile: Profile, last: number) {
  const root = join(dataDir, 'counterpush/runs');
  const directories = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .toSorted()
    .slice(-last);
  const analyses: LossAnalysis[] = [];
  for (const directory of directories) {
    const summary = await readJsonFile(join(directory, 'summary.json'), summarySchema);
    if (!summary.seenBattle || !['win', 'loss', 'draw'].includes(summary.result)) continue;
    analyses.push(
      (await readOptionalJsonFile(join(directory, 'loss-analysis.json'), lossAnalysisSchema)) ??
        (await analyzeEpisode(directory, profile)),
    );
  }
  const groups = groupBy(
    analyses,
    (item) => `controller ${item.controllerVersion} policy ${item.policyVersion ?? '?'}`,
  );
  return {
    runs: directories.length,
    analyzed: analyses.length,
    groups: Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, summarize(items)])),
  };
}
