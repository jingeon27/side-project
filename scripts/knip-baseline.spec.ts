import { resolve } from 'node:path';

import type { Issue, IssueType, ReporterOptions } from 'knip';
import { describe, expect, it } from 'vitest';

import { applyKnipBaseline, resolvedKnipBaselineEntries, type TKnipBaselineEntry } from './knip-baseline';

function report(
  entries: Array<{ type: IssueType; file: string; symbol: string; line?: number }>,
  overrides: Record<string, unknown> = {},
) {
  const issues = entries.reduce<Record<string, Record<string, Record<string, Issue>>>>((result, row) => {
    const file = resolve(row.file);
    return {
      ...result,
      [row.type]: {
        ...result[row.type],
        [file]: {
          ...result[row.type]?.[file],
          [row.symbol]: {
            type: row.type,
            filePath: file,
            symbol: row.symbol,
            line: row.line,
            fixes: [],
          } as unknown as Issue,
        },
      },
    };
  }, {});
  return {
    cwd: process.cwd(),
    issues,
    counters: { processed: 20, total: 30 },
    report: { files: true, exports: true, types: true },
    isProduction: false,
    ...overrides,
  } as unknown as ReporterOptions;
}

describe('Knip 기준선', () => {
  it('기존 항목의 줄이 바뀌어도 제외하고 새 이름과 새 파일은 남겨야 한다', () => {
    const options = report([
      { type: 'exports', file: 'src/a.ts', symbol: 'legacy', line: 99 },
      { type: 'exports', file: 'src/a.ts', symbol: 'newExport' },
      { type: 'exports', file: 'src/b.ts', symbol: 'legacy' },
    ]);
    const result = applyKnipBaseline(options, [['exports', 'src/a.ts', 'legacy']]);
    expect(Object.values(result.issues.exports).flatMap(Object.keys).sort()).toEqual(['legacy', 'newExport']);
    expect(result.counters.exports).toBe(2);
    expect(result.counters.processed).toBe(20);
    expect(Object.keys(options.issues.exports[resolve('src/a.ts')] ?? {})).toContain('legacy');
  });

  it('파일과 이름이 같아도 다른 종류의 문제를 숨기지 않아야 한다', () => {
    const result = applyKnipBaseline(report([{ type: 'unlisted', file: 'package.json', symbol: 'legacy' }]), [
      ['dependencies', 'package.json', 'legacy'],
    ]);
    expect(result.counters.unlisted).toBe(1);
  });

  it('빈 기준선에서는 모든 문제를 유지해야 한다', () => {
    const options = report([{ type: 'files', file: 'src/orphan.ts', symbol: 'src/orphan.ts' }]);
    expect(applyKnipBaseline(options, []).counters.files).toBe(1);
  });

  it('전체 실행에서 더는 나오지 않는 기준선 항목을 정리 대상으로 알려야 한다', () => {
    const baseline: TKnipBaselineEntry[] = [
      ['exports', 'src/a.ts', 'legacy'],
      ['files', 'src/orphan.ts', 'src/orphan.ts'],
    ];
    const options = report([{ type: 'exports', file: 'src/a.ts', symbol: 'legacy', line: 12 }]);
    expect(resolvedKnipBaselineEntries(options, baseline)).toEqual([
      ['files', 'src/orphan.ts', 'src/orphan.ts'],
    ]);
  });

  it.each([
    ['workspace를 골라', { selectedWorkspaces: ['packages/toolkit'] }],
    ['production 모드로', { isProduction: true }],
    ['해당 종류를 빼고', { report: { files: false, exports: true, types: true } }],
  ])('%s 실행한 결과로는 기준선 항목이 정리됐다고 판단하지 않아야 한다', (_, overrides) => {
    const baseline: TKnipBaselineEntry[] = [['files', 'src/orphan.ts', 'src/orphan.ts']];
    expect(resolvedKnipBaselineEntries(report([], overrides), baseline)).toEqual([]);
  });
});
