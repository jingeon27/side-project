import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { range, sumBy } from 'es-toolkit';
import { describe, expect, it } from 'vitest';

import type { DecisionContext } from './decision-v3.ts';
import {
  ACTION_SIZE,
  actionFeatures,
  contextFeatures,
  FAST_POLICY,
  FastPolicy,
  forward,
  STATE_SIZE,
  weightsChecksum,
  type FastWeights,
} from './fast-policy.ts';

type Case = {
  context: DecisionContext;
  features: Array<[number, number]>;
  actionFeatures: number[][];
  logits: number[];
  value: number;
};
const fixture = JSON.parse(
  await readFile(new URL('../../../test-fixtures/fast-policy-cases.json', import.meta.url), 'utf8'),
) as { deterministicWeightsSHA256: string; cases: Case[] };

const SHAPES: Record<keyof FastWeights, number[]> = {
  'action.bias': [FAST_POLICY.attention],
  'action.weight': [FAST_POLICY.attention, ACTION_SIZE],
  'encoder.bias': [FAST_POLICY.hidden],
  'encoder.weight': [FAST_POLICY.hidden, STATE_SIZE],
  'query.bias': [FAST_POLICY.attention],
  'query.weight': [FAST_POLICY.attention, FAST_POLICY.hidden],
  'value.bias': [1],
  'value.weight': [1, FAST_POLICY.hidden],
};

// Python 검사(clash_bot.arena.fast_features_test)와 같은 공식으로 가중치를 만든다.
function deterministicWeights() {
  const names = Object.keys(SHAPES).toSorted() as Array<keyof FastWeights>;
  const sizes = names.map((name) => SHAPES[name].reduce((a, b) => a * b));
  const offsets = sizes.map((_, index) => sumBy(sizes.slice(0, index), (size) => size));
  return Object.fromEntries(
    names.map((name, index) => [
      name,
      Float32Array.from(
        range(sizes[index]!),
        (k) => ((((offsets[index]! + k) * 7919) % 2003) / 2003 - 0.5) * 0.2,
      ),
    ]),
  ) as unknown as FastWeights;
}
const weights = Object.fromEntries(
  Object.entries(deterministicWeights()).map(([name, values]) => [name, Float64Array.from(values)]),
) as FastWeights;

describe('the live fast policy computes what the Python trainer computes', () => {
  it.each(fixture.cases.map((item, index) => [index, item] as const))('shared case %i', (_, item) => {
    const state = contextFeatures(item.context);
    const expected = new Float64Array(STATE_SIZE);
    for (const [index, value] of item.features) expected[index] = value;
    state.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 5));
    const actions = actionFeatures(item.context);
    actions.forEach((row, index) =>
      row.forEach((value, column) => expect(value).toBeCloseTo(item.actionFeatures[index]![column]!, 5)),
    );
    const result = forward(weights, state, actions);
    result.logits.forEach((logit, index) => expect(logit).toBeCloseTo(item.logits[index]!, 4));
    expect(result.value).toBeCloseTo(item.value, 4);
    expect(sumBy(result.probabilities, (probability) => probability)).toBeCloseTo(1, 9);
  });

  it('hashes weights exactly like the Python exporter', () => {
    expect(weightsChecksum(weights)).toBe(fixture.deterministicWeightsSHA256);
  });
});

describe('loading an exported policy', () => {
  const exported = (sha: string) => ({
    format: FAST_POLICY.format,
    stateSize: STATE_SIZE,
    actionSize: ACTION_SIZE,
    weightsSHA256: sha,
    version: 4,
    rulesID: 'rules-a',
    weights: Object.fromEntries(
      Object.entries(SHAPES).map(([name, shape]) => [
        name,
        { shape, values: Array.from(weights[name as keyof FastWeights]) },
      ]),
    ),
  });

  it('accepts the checked weights and rejects a changed file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clash-fast-policy-'));
    try {
      const path = join(directory, 'policy.json');
      await writeFile(path, JSON.stringify(exported(fixture.deterministicWeightsSHA256)));
      const policy = await FastPolicy.load(path);
      expect(policy.version).toBe(4);
      const decision = policy.predict(fixture.cases[0]!.context);
      decision.logits.forEach((logit, index) =>
        expect(logit).toBeCloseTo(fixture.cases[0]!.logits[index]!, 4),
      );
      await writeFile(path, JSON.stringify(exported('0'.repeat(64))));
      await expect(FastPolicy.load(path)).rejects.toThrow('체크섬');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
