import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';

import type { Issue, IssueType, ReporterOptions } from 'knip';

export type TKnipBaselineEntry = readonly [type: IssueType, file: string, symbol: string];

/** 줄 번호와 관계없이 같은 파일의 같은 종류와 이름만 기존 항목으로 취급한다. */
export function applyKnipBaseline(
  options: ReporterOptions,
  baseline: readonly TKnipBaselineEntry[],
): ReporterOptions {
  const known = new Set(baseline.map((entry) => JSON.stringify(entry)));
  const keep = (type: string, issue: Issue) =>
    !known.has(
      JSON.stringify([type, relative(options.cwd, issue.filePath).split(sep).join('/'), issue.symbol]),
    );
  const issues = Object.fromEntries(
    Object.entries(options.issues).map(([type, files]) => [
      type,
      Object.fromEntries(
        Object.entries(files).flatMap(([file, symbols]) => {
          const remaining = Object.fromEntries(
            Object.entries(symbols).filter(([, issue]) => keep(type, issue)),
          );
          return Object.keys(remaining).length ? [[file, remaining]] : [];
        }),
      ),
    ]),
  ) as ReporterOptions['issues'];
  const counts = Object.fromEntries(
    Object.entries(issues).map(([type, files]) => [
      type,
      Object.values(files).reduce((count, symbols) => count + Object.keys(symbols).length, 0),
    ]),
  );
  return { ...options, issues, counters: { ...options.counters, ...counts } };
}

export default function knipBaseline(options: ReporterOptions): ReporterOptions {
  const baseline = JSON.parse(readFileSync(new URL('../knip-baseline.json', import.meta.url), 'utf8')) as {
    issues: TKnipBaselineEntry[];
  };
  return applyKnipBaseline(options, baseline.issues);
}
