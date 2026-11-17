import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { counterpushBarReading, counterpushElixir } from '../perception/elixir.ts';
import { battleScreen, episodeHarness, readLines, START, type Decision } from './episode.fixture.ts';

const { fixture, play } = episodeHarness();

it('reads the synthetic screens like a real battle', async () => {
  const profile = fixture.profile!;
  const reading = await counterpushBarReading(
    await battleScreen(profile, { hand: START, elixir: 7 }),
    profile,
  );
  expect(counterpushElixir(reading, profile).value).toBe(7);
  expect(reading.elixirConfidence).toBeGreaterThanOrEqual(0.9);
});

it('keeps public-field perception running while controller 3 waits for a model decision', async () => {
  const played = await play({
    controllerVersion: 3,
    screens: { start: { hand: START, elixir: 7 } },
    decisions: [{ pick: 'wait', delayMs: 650 }],
  });
  expect(played.fake.match.scansWhileDeciding).toBeGreaterThan(0);
  expect(played.outcome.result).toBe('loss');
});

describe.each([
  {
    controllerVersion: 3 as const,
    decisions: [{ pick: 'wait' }, { pick: 'wait', elapsedMs: 1500 }, { pick: 'knight' }],
  },
  { controllerVersion: 1 as const, decisions: [{ pick: 'wait' }, { pick: 'knight' }] },
] satisfies Array<{ controllerVersion: 1 | 3; decisions: Decision[] }>)(
  'a recorded Counterpush match with controller $controllerVersion',
  ({ controllerVersion, decisions }) => {
    it('records decisions, a confirmed card input and the verified result', { timeout: 30_000 }, async () => {
      const { fake, outcome, events, types } = await play({
        controllerVersion,
        screens: {
          start: { hand: START, elixir: 7 },
          after: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 4 },
        },
        decisions,
        afterPlay: { 1: 'after' },
        end: { inputs: 1, captures: 1 },
      });

      expect(outcome).toMatchObject({
        result: 'loss',
        actions: 1,
        confirmed: 1,
        abilityActions: 0,
        seenBattle: true,
        opponentActions: 0,
        learningEligible: true,
      });
      expect(types).toEqual(
        controllerVersion === 3
          ? [
              'match_start',
              'prediction',
              'wait_check',
              'prediction',
              'rejected',
              'prediction',
              'input_sent',
              'input_check',
              'result',
            ]
          : ['match_start', 'prediction', 'wait_check', 'prediction', 'input_sent', 'input_check', 'result'],
      );
      expect(events[0]).toMatchObject({ controllerVersion, initialPhase: 'setup', deck: expect.any(Array) });
      if (controllerVersion === 3)
        expect(events[4]).toMatchObject({ reason: 'decision_deadline_exceeded', elapsedMs: 1500 });
      const input = events.find((event) => event.type === 'input_sent')!;
      const knight = fake.match.requests.at(-1)!.candidates.find((action) => action.card === 'knight')!;
      expect(fake.match.plays).toEqual([{ slot: knight.slot, target: knight.target }]);
      expect(input.action).toMatchObject({ slot: knight.slot - 1, card: 'knight' });
      expect(events.find((event) => event.type === 'input_check')).toMatchObject({
        confirmed: true,
        changed: true,
        spent: 3,
        expectedCost: 3,
      });
      expect(events.at(-1)).toMatchObject({
        type: 'result',
        blue: 1,
        red: 3,
        outcome: 'loss',
        readings: ['Crowns: you 1, the opponent 3', 'Crowns: you 1, the opponent 3'],
      });
      const predictions = events.filter((event) => event.type === 'prediction');
      expect(predictions.map((event) => event.frame)).toEqual(predictions.map((_, index) => index + 1));
      for (const request of fake.match.requests) {
        expect(request.controllerVersion).toBe(controllerVersion);
        expect(request.candidates.some((action) => action.id === 0)).toBe(true);
      }

      const summary = JSON.parse(await readFile(join(outcome.directory, 'summary.json'), 'utf8'));
      expect(summary).toMatchObject({
        result: 'loss',
        blue: 1,
        red: 3,
        actions: 1,
        confirmed: 1,
        decisions: decisions.length,
      });
      const observations = JSON.parse(await readFile(join(outcome.directory, 'observations.json'), 'utf8'));
      expect(observations).toMatchObject({ version: 1, actor: 'red_top', observations: [] });
      const states = await readLines(join(outcome.directory, 'states.jsonl'));
      expect(states.length).toBeGreaterThanOrEqual(decisions.length);
      expect(states.every((row) => row.version === 1 && typeof row.situation === 'object')).toBe(true);
      expect((await readLines(join(outcome.directory, 'vision.jsonl'))).length).toBe(states.length);
      expect(await readdir(outcome.directory)).toEqual(
        expect.arrayContaining(['0001.png', 'frames', 'result-page.png']),
      );
    });
  },
);
