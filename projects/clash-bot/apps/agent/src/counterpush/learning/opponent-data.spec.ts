import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { BattleMemory } from '../../core/battle/battle-state.ts';
import type { OpponentObservation } from '../../core/battle/observation.ts';
import { DEFAULT_PROFILE } from '../../core/profile.ts';
import { mirrorActions } from './mirror-policy.ts';
import {
  macroMatches,
  observationExclusion,
  opponentObservationsSchema,
  prepareOpponentDataset,
} from './opponent-data.ts';

const deck = [
  'furnace',
  'ice_wizard',
  'knight',
  'graveyard',
  'skeletons',
  'poison',
  'goblin_hut',
  'barbarian_barrel',
] as const;
const situation = new BattleMemory([...deck]).observe({
  at: 1_000,
  amount: 5,
  hand: ['furnace', 'knight', 'poison', 'skeletons'],
  inputPending: false,
  allies: [],
  enemies: [],
});
const observation: OpponentObservation = {
  id: 'furnace-left',
  before: { image: 'before.png', capturedAt: 1_000 },
  after: { image: 'after.png', capturedAt: 4_000 },
  card: 'furnace',
  lane: 'left',
  confidence: 0.95,
  evidence: 'new_unit_visible',
  verifiedActor: true,
  absentBefore: true,
  context: 'Automatic red-marker track; furnace.',
  situation,
};

describe('opponent visual demonstrations', () => {
  it('excludes ambiguous timing, future context, existing units, low confidence and an unverified actor', () => {
    expect(observationExclusion(observation)).toBeNull();
    expect(observationExclusion({ ...observation, confidence: 0.7 })).toBe('low_visual_confidence');
    expect(observationExclusion({ ...observation, absentBefore: false })).toBe(
      'unverified_actor_or_new_action',
    );
    expect(observationExclusion({ ...observation, verifiedActor: false })).toBe(
      'unverified_actor_or_new_action',
    );
    expect(
      observationExclusion({ ...observation, after: { ...observation.after, capturedAt: 20_000 } }),
    ).toBe('ambiguous_time_window');
    expect(observationExclusion({ ...observation, situation: { ...situation, at: 2_000 } })).toBe(
      'future_context_leak',
    );
  });

  it('keeps screen-left/right when reflecting the top player and labels only the card/lane', () => {
    const actions = mirrorActions(DEFAULT_PROFILE, [...deck], situation);
    const target = actions.find((action) => macroMatches(action, 'furnace', 'left'));
    expect(target?.target.x).toBe(95);
    expect(target?.target.y).toBeGreaterThan(DEFAULT_PROFILE.riverY);
    expect(target?.slot).toBe(0);
    expect(actions.find((action) => macroMatches(action, 'graveyard', 'right'))?.target.y).toBeLessThan(
      DEFAULT_PROFILE.riverY,
    );
    expect(actions.some((action) => action.card === 'minipekka')).toBe(false);
    expect(actions.length).toBeLessThanOrEqual(26);
  });

  it('rejects cards outside the known opponent deck', () => {
    expect(() =>
      opponentObservationsSchema.parse({
        version: 1,
        source: 'counterpush_live_screen',
        actor: 'red_top',
        annotation: 'automatic_dino_tracking',
        deck,
        crop: { x: 0, y: 0, width: 368, height: 652 },
        observations: [{ ...observation, card: 'giant' }],
      }),
    ).toThrow();
  });

  it('prepares auditable before/after pairs, keeps hidden state unknown and skips long gaps', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clash-opponent-'));
    try {
      const before = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#315a43' } })
        .png()
        .toBuffer();
      const after = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#815c35' } })
        .png()
        .toBuffer();
      await writeFile(join(directory, 'before.png'), before);
      await writeFile(join(directory, 'after.png'), after);
      await writeFile(
        join(directory, 'events.jsonl'),
        JSON.stringify({
          type: 'result',
          source: 'counterpush_result_dom_verified2',
          blue: 0,
          red: 3,
          readings: ['Crowns: you 0, the opponent 3', 'Crowns: you 0, the opponent 3'],
        }) + '\n',
      );
      await writeFile(
        join(directory, 'qualification.json'),
        JSON.stringify({ role: 'candidate_training', directory: '/private' }),
      );
      await writeFile(
        join(directory, 'qualification.json'),
        JSON.stringify({ role: 'candidate_training', directory: '/private' }),
      );
      const path = join(directory, 'observations.json');
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          source: 'counterpush_live_screen',
          actor: 'red_top',
          annotation: 'automatic_dino_tracking',
          deck,
          crop: { x: 0, y: 0, width: 368, height: 652 },
          observations: [
            observation,
            { ...observation, id: 'ambiguous', after: { ...observation.after, capturedAt: 20_000 } },
          ],
        }),
      );
      const result = await prepareOpponentDataset(path, directory, { ...DEFAULT_PROFILE, deck: [...deck] });
      const dataset = JSON.parse(await readFile(result.path, 'utf8'));
      expect(result.samples).toBe(1);
      expect(result.excluded).toEqual([{ id: 'ambiguous', reason: 'ambiguous_time_window' }]);
      expect(dataset.samples[0]).toMatchObject({
        card: 'furnace',
        lane: 'left',
        hand: null,
        elixir: null,
        exact_target: null,
      });
      expect(dataset.format).toBe('counterpush-mirror-actor-demonstrations-v4');
      expect(dataset.samples[0].situation).toEqual(situation);
      expect(dataset.samples[0].image_sha256).not.toBe(dataset.samples[0].evidence_sha256);
      expect(await prepareOpponentDataset(path, directory, { ...DEFAULT_PROFILE, deck: [...deck] })).toEqual(
        result,
      );
      await writeFile(
        join(directory, 'counterpush/quarantine.json'),
        JSON.stringify({
          version: 1,
          entries: [
            {
              before_sha256: dataset.samples[0].source_before_sha256,
              card: 'furnace',
              reason: 'before_frame_already_contains_unit',
            },
          ],
        }),
      );
      const quarantined = await prepareOpponentDataset(path, directory, {
        ...DEFAULT_PROFILE,
        deck: [...deck],
      });
      expect(quarantined.samples).toBe(0);
      expect(quarantined.path).not.toBe(result.path);
      expect(quarantined.excluded[0]?.reason).toBe('quarantined:before_frame_already_contains_unit');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

it('learns a defensive Poison region and keeps AFTER location out of the BLUE actor prompt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-mirror-poison-'));
  try {
    const image = await sharp({ create: { width: 368, height: 652, channels: 3, background: '#315a43' } })
      .png()
      .toBuffer();
    await writeFile(join(directory, 'before.png'), image);
    await writeFile(join(directory, 'after.png'), image);
    await writeFile(
      join(directory, 'events.jsonl'),
      JSON.stringify({
        type: 'result',
        source: 'counterpush_result_dom_verified2',
        blue: 0,
        red: 3,
        readings: ['Crowns: you 0, the opponent 3', 'Crowns: you 0, the opponent 3'],
      }) + '\n',
    );
    const observed = [95, 273].map((x, index) => ({
      ...observation,
      id: `poison-${index}`,
      card: 'poison',
      lane: x < 184 ? 'left' : 'right',
      evidence: 'spell_effect_visible',
      grounding: { x, y: 164, box: [x - 25, 139, x + 25, 189] },
    }));
    await writeFile(
      join(directory, 'qualification.json'),
      JSON.stringify({ role: 'candidate_training', directory: '/private' }),
    );
    const path = join(directory, 'observations.json');
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        source: 'counterpush_live_screen',
        actor: 'red_top',
        annotation: 'automatic_dino_tracking',
        deck,
        crop: { x: 0, y: 0, width: 368, height: 652 },
        observations: observed,
      }),
    );
    const prepared = await prepareOpponentDataset(path, directory, { ...DEFAULT_PROFILE, deck: [...deck] });
    const dataset = JSON.parse(await readFile(prepared.path, 'utf8')) as {
      samples: Array<{
        label_kind: string;
        prompt: string;
        target_ids: number[];
        candidates: Array<{ id: number; card: string; target: { x: number; y: number } }>;
      }>;
    };
    expect(prepared.samples).toBe(2);
    expect(dataset.samples[0]?.label_kind).toBe('placement_region');
    expect(dataset.samples[0]?.prompt).toBe(dataset.samples[1]?.prompt);
    expect(dataset.samples[0]?.target_ids).not.toEqual(dataset.samples[1]?.target_ids);
    for (const sample of dataset.samples)
      expect(
        sample.candidates
          .filter((row) => sample.target_ids.includes(row.id))
          .every((row) => row.card === 'poison' && row.target.y > DEFAULT_PROFILE.riverY),
      ).toBe(true);
    await writeFile(
      join(directory, 'events.jsonl'),
      JSON.stringify({
        type: 'result',
        source: 'counterpush_result_dom_verified2',
        blue: 3,
        red: 0,
        readings: ['Crowns: you 3, the opponent 0', 'Crowns: you 3, the opponent 0'],
      }) + '\n',
    );
    const losingTeacher = await prepareOpponentDataset(path, directory, {
      ...DEFAULT_PROFILE,
      deck: [...deck],
    });
    expect(losingTeacher.samples).toBe(0);
    expect(losingTeacher.excluded.every((row) => row.reason === 'teacher_not_verified_winner')).toBe(true);
    await writeFile(join(directory, 'qualification.json'), JSON.stringify({ role: 'heldout_evaluation' }));
    await expect(
      prepareOpponentDataset(path, directory, { ...DEFAULT_PROFILE, deck: [...deck] }),
    ).rejects.toThrow('평가 경기');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
