import { resolve } from 'node:path';

import type { Issue, IssueType, ReporterOptions } from 'knip';
import { describe, expect, it } from 'vitest';

import { applyKnipBaseline } from './knip-baseline';

function report(entries: Array<{ type: IssueType; file: string; symbol: string; line?: number }>) {
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
  return { cwd: process.cwd(), issues, counters: { processed: 20, total: 30 } } as unknown as ReporterOptions;
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

  it('빈 기준선에서는 모든 문제를 유지하고 해결된 기준선 항목은 문제를 만들지 않아야 한다', () => {
    const options = report([{ type: 'files', file: 'src/orphan.ts', symbol: 'src/orphan.ts' }]);
    expect(applyKnipBaseline(options, []).counters.files).toBe(1);
    const result = applyKnipBaseline(report([]), [['files', 'src/orphan.ts', 'src/orphan.ts']]);
    expect(Object.keys(result.issues)).toHaveLength(0);
  });
});
