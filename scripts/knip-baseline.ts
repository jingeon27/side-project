import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';

import type { Issue, IssueType, ReporterOptions } from 'knip';

export type TKnipBaselineEntry = readonly [type: IssueType, file: string, symbol: string];

const issueKey = (options: ReporterOptions, type: string, issue: Issue) =>
  JSON.stringify([type, relative(options.cwd, issue.filePath).split(sep).join('/'), issue.symbol]);

/** 줄 번호와 관계없이 같은 파일의 같은 종류와 이름만 기존 항목으로 취급한다. */
export function applyKnipBaseline(
  options: ReporterOptions,
  baseline: readonly TKnipBaselineEntry[],
): ReporterOptions {
  const known = new Set(baseline.map((entry) => JSON.stringify(entry)));
  const keep = (type: string, issue: Issue) => !known.has(issueKey(options, type, issue));
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

/**
 * 이번 실행에서 더는 나오지 않는 기준선 항목이다. 남겨 두면 같은 파일·이름의 새 문제를 숨긴다.
 * workspace·종류를 골라 일부만 검사했거나 production 모드로 실행했으면 판단하지 않는다.
 */
export function resolvedKnipBaselineEntries(
  options: ReporterOptions,
  baseline: readonly TKnipBaselineEntry[],
): TKnipBaselineEntry[] {
  if (options.selectedWorkspaces || options.isProduction) return [];
  const reported = new Set(
    Object.entries(options.issues).flatMap(([type, files]) =>
      Object.values(files).flatMap((symbols) =>
        Object.values(symbols).map((issue) => issueKey(options, type, issue)),
      ),
    ),
  );
  return baseline.filter((entry) => options.report[entry[0]] && !reported.has(JSON.stringify(entry)));
}

export default function knipBaseline(options: ReporterOptions): ReporterOptions {
  const baseline = JSON.parse(readFileSync(new URL('../knip-baseline.json', import.meta.url), 'utf8')) as {
    issues: TKnipBaselineEntry[];
  };
  const resolved = resolvedKnipBaselineEntries(options, baseline.issues);
  // 전처리기가 실패하면 Knip은 결과를 출력하지 않으므로 다른 새 문제를 함께 볼 방법을 알린다.
  if (resolved.length)
    throw new Error(
      `정리한 항목을 knip-baseline.json에서도 지워야 합니다: ${resolved.map((entry) => JSON.stringify(entry)).join(', ')}. 다른 문제를 포함한 전체 결과는 yarn knip:report로 확인합니다.`,
    );
  return applyKnipBaseline(options, baseline.issues);
}
