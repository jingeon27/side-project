import type { BrowserResult } from '../browser/browser.ts';

// events.jsonl의 학습 증거 행이다. Python 학습기(clash_bot.qwen.records.episode_events)가 같은 필드로 판정하므로,
// 필드를 바꾸면 test-fixtures/counterpush/episode-events.json과 양쪽 검사를 함께 갱신한다.
export const resultEvent = (options: { first: BrowserResult; second: BrowserResult }) => ({
  type: 'result',
  blue: options.second.blue,
  red: options.second.red,
  outcome: options.second.outcome,
  source: 'counterpush_result_dom_verified2',
  readings: [options.first.label, options.second.label],
});

export const inputCheckEvent = (options: {
  frame: number;
  check: { changed: boolean; spent: number; confirmed: boolean } | undefined;
  expectedCost: number;
  checks: number;
  action: unknown;
}) => ({
  type: 'input_check',
  frame: options.frame,
  changed: options.check?.changed ?? false,
  spent: options.check?.spent ?? 0,
  confirmed: options.check?.confirmed ?? false,
  expectedCost: options.expectedCost,
  checks: options.checks,
  action: options.action,
});

export const abilityCheckEvent = (options: {
  frame: number;
  check: { changed: boolean; handUnchanged: boolean; confirmed: boolean; spent: number } | undefined;
  checks: number;
  action: unknown;
}) => ({
  type: 'ability_check',
  frame: options.frame,
  ...options.check,
  confirmed: options.check?.confirmed ?? false,
  expectedCost: 2,
  checks: options.checks,
  action: options.action,
});

export const waitCheckEvent = (options: { frame: number; valid: boolean }) => ({
  type: 'wait_check',
  frame: options.frame,
  valid: options.valid,
});
