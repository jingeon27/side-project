import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { range, sumBy } from 'es-toolkit';
import { describe, expect, it } from 'vitest';

import { CARD_CATALOGUE, catalogueCard, isCatalogueBody } from '../card-catalogue.ts';
import { CARD_INFO } from '../cards.ts';
import { LIVE_DECK } from '../deck.ts';
import { UNIT_KINDS } from '../knowledge.ts';
import type { DecisionContext } from '../policy/decision-v3.ts';
import { ACTION_SIZE, actionFeatures, contextFeatures, FAST_POLICY, STATE_SIZE } from './features.ts';
import { FastPolicy, forward, weightsChecksum, type FastWeights } from './policy.ts';
import { fastActionBias } from './tactics.ts';

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

// Python 검사(clash_bot.arena.policy.features_test)와 같은 공식으로 가중치를 만든다.
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
  const exported = (sha: string, catalogue = CARD_CATALOGUE.id) => ({
    format: FAST_POLICY.format,
    choice: FAST_POLICY.choice,
    stateSize: STATE_SIZE,
    actionSize: ACTION_SIZE,
    weightsSHA256: sha,
    catalogue,
    version: 4,
    rulesID: 'rules-a',
    weights: Object.fromEntries(
      Object.entries(SHAPES).map(([name, shape]) => [
        name,
        { shape, values: Array.from(weights[name as keyof FastWeights]) },
      ]),
    ),
  });

  it('accepts the checked weights and rejects a changed file or another card catalogue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clash-fast-policy-'));
    try {
      const path = join(directory, 'policy.json');
      await writeFile(path, JSON.stringify(exported(fixture.deterministicWeightsSHA256)));
      const policy = await FastPolicy.load(path);
      expect(policy.version).toBe(4);
      const decision = policy.predict(fixture.cases[0]!.context);
      const bias = fastActionBias(fixture.cases[0]!.context);
      decision.logits.forEach((logit, index) => {
        expect(decision.probabilities[index]).toBeGreaterThan(0);
        expect(logit).toBeCloseTo(fixture.cases[0]!.logits[index]! + bias[index]!, 4);
      });
      await writeFile(path, JSON.stringify(exported('0'.repeat(64))));
      await expect(FastPolicy.load(path)).rejects.toThrow('체크섬');
      await writeFile(path, JSON.stringify(exported(fixture.deterministicWeightsSHA256, 'c'.repeat(64))));
      await expect(FastPolicy.load(path)).rejects.toThrow('카드 카탈로그');
      await writeFile(
        path,
        JSON.stringify({ ...exported(fixture.deterministicWeightsSHA256), choice: undefined }),
      );
      await expect(FastPolicy.load(path)).rejects.toThrow('choice');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

it('lets learned scores choose a legal Graveyard despite advice to wait for Mother Witch', () => {
  const sample = fixture.cases[0]!.context;
  const context: DecisionContext = {
    ...sample,
    enemyCycle: [['witch_mother', 0, 4]],
    actions: sample.actions.slice(0, 2),
  };
  const initial = Object.fromEntries(
    Object.entries(SHAPES).map(([name, shape]) => [
      name,
      new Float64Array(shape.reduce((size, dimension) => size * dimension, 1)),
    ]),
  ) as FastWeights;
  const advised = new FastPolicy(initial, null).predict(context);
  expect(advised.choice).toBe(0);
  expect(advised.probabilities[1]).toBeGreaterThan(0);
  const learned: FastWeights = {
    ...initial,
    'query.bias': Float64Array.from({ length: FAST_POLICY.attention }, (_, index) =>
      index === 0 ? 2 * Math.sqrt(FAST_POLICY.attention) : 0,
    ),
    'action.weight': Float64Array.from({ length: initial['action.weight'].length }, (_, index) =>
      index === 2 ? 1 : 0,
    ),
  };
  expect(new FastPolicy(learned, null).predict(context).choice).toBe(1);
});

describe('cards and bodies read through the catalogue, not one slot per name', () => {
  const context = (hand: Array<string | null>, enemy: DecisionContext['enemy']): DecisionContext => ({
    hand,
    elixir: 5,
    enemyElixir: { min: 4, max: 6 },
    own: [],
    enemy,
    bodies: {
      own: [],
      enemy: enemy.map(([kind, x, y, variant]) => ({ kind, x, y, variant, velocity: null, hp: null })),
    },
    deployments: [],
    actions: [['A', 'wait', null, 0, 0, 0]],
  });

  it('keeps one state size for any deck and sees another deck through the same attributes', () => {
    const ours = contextFeatures(
      context(['knight', 'furnace', 'poison', 'skeletons'], [['knight', 9, 20, '?']]),
    );
    const theirs = contextFeatures(
      context(['hog_rider', 'musketeer', 'the_log', 'cannon'], [['minipekka', 9, 20, '?']]),
    );
    expect(ours).toHaveLength(STATE_SIZE);
    expect(theirs).toHaveLength(STATE_SIZE);
    expect(ours).not.toEqual(theirs);
    // A unit the screen cannot name still occupies its cell, as an unknown body.
    const unknown = contextFeatures(context([null, null, null, null], [['unseen_thing', 9, 20, '?']]));
    const empty = contextFeatures(context([null, null, null, null], []));
    expect(sumBy(Array.from(unknown), (value) => value) - sumBy(Array.from(empty), (value) => value)).toBe(
      0.5,
    );
  });

  it('every card and unit the live screen can name has catalogue attributes', () => {
    for (const card of LIVE_DECK) expect(catalogueCard(card), card).toBeDefined();
    for (const card of Object.keys(CARD_INFO)) expect(catalogueCard(card), card).toBeDefined();
    for (const kind of UNIT_KINDS) expect(isCatalogueBody(kind), kind).toBe(true);
    for (const effect of ['graveyard', 'poison']) expect(isCatalogueBody(effect), effect).toBe(true);
  });
});
