import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { BrowserResult } from '../browser/browser.ts';
import { abilityCheckEvent, inputCheckEvent, resultEvent, waitCheckEvent } from './episode-events.ts';

// Python 학습기(clash_bot.qwen.records.episode_events_test)는 같은 행을 학습 증거로 판정한다.
type Case = { name: string; builder: string; args: Record<string, unknown>; row: Record<string, unknown> };
const { cases } = JSON.parse(
  await readFile(new URL('../../../test-fixtures/counterpush/episode-events.json', import.meta.url), 'utf8'),
) as { cases: Case[] };

const builders: Record<string, (args: Record<string, unknown>) => Record<string, unknown>> = {
  result: (args) => resultEvent(args as { first: BrowserResult; second: BrowserResult }),
  inputCheck: (args) => inputCheckEvent(args as Parameters<typeof inputCheckEvent>[0]),
  abilityCheck: (args) => abilityCheckEvent(args as Parameters<typeof abilityCheckEvent>[0]),
  waitCheck: (args) => waitCheckEvent(args as Parameters<typeof waitCheckEvent>[0]),
};

describe('episode evidence rows shared with the Python learner', () => {
  it.each(cases)('writes "$name" exactly as the shared fixture records it', (example) => {
    const build = builders[example.builder];
    if (!build) throw new Error(`알 수 없는 이벤트 생성기: ${example.builder}`);
    expect(build(example.args)).toEqual(example.row);
  });
});
