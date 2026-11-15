import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  macroMatches,
  observationExclusion,
  opponentActions,
  opponentObservationsSchema,
  prepareOpponentDataset,
  type OpponentObservation,
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
const observation: OpponentObservation = {
  id: 'furnace-left',
  before: { image: 'before.png', secondsRemaining: 165 },
  after: { image: 'after.png', secondsRemaining: 161 },
  card: 'furnace',
  lane: 'left',
  confidence: 0.95,
  evidence: 'new_unit_visible',
  verifiedActor: true,
  absentBefore: true,
  context: 'Opponent adds a furnace in the left lane.',
};

describe('opponent visual demonstrations', () => {
  it('excludes ambiguous timing, existing units, low confidence and an unverified actor', () => {
    expect(observationExclusion(observation)).toBeNull();
    expect(observationExclusion({ ...observation, confidence: 0.7 })).toBe('low_visual_confidence');
    expect(observationExclusion({ ...observation, absentBefore: false })).toBe(
      'unverified_actor_or_new_action',
    );
    expect(observationExclusion({ ...observation, verifiedActor: false })).toBe(
      'unverified_actor_or_new_action',
    );
    expect(
      observationExclusion({ ...observation, after: { ...observation.after, secondsRemaining: 145 } }),
    ).toBe('ambiguous_time_window');
  });

  it('keeps screen-left/right when reflecting the top player and labels only the card/lane', () => {
    const actions = opponentActions([...deck]);
    const target = actions.find((action) => macroMatches(action, 'furnace', 'left'));
    expect(target?.target).toEqual({ x: 95, y: 132 });
    expect(target?.slot).toBe(0);
    expect(actions.find((action) => macroMatches(action, 'graveyard', 'right'))?.target.y).toBeGreaterThan(
      276,
    );
    expect(actions.some((action) => action.card === 'minipekka')).toBe(false);
  });

  it('rejects cards outside the known opponent deck', () => {
    expect(() =>
      opponentObservationsSchema.parse({
        version: 1,
        source: 'counterpush_live_screen',
        actor: 'red_top',
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
      const path = join(directory, 'observations.json');
      await writeFile(
        path,
        JSON.stringify({
          version: 1,
          source: 'counterpush_live_screen',
          actor: 'red_top',
          deck,
          crop: { x: 0, y: 0, width: 368, height: 652 },
          observations: [
            observation,
            { ...observation, id: 'ambiguous', before: { ...observation.before, secondsRemaining: 180 } },
          ],
        }),
      );
      const result = await prepareOpponentDataset(path, directory);
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
      expect(dataset.samples[0].prompt).toContain('RED hand=UNKNOWN; RED elixir=UNKNOWN');
      expect(dataset.samples[0].prompt).not.toContain(observation.context);
      expect(dataset.samples[0].image_sha256).not.toBe(dataset.samples[0].evidence_sha256);
      expect(await prepareOpponentDataset(path, directory)).toEqual(result);
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
      const quarantined = await prepareOpponentDataset(path, directory);
      expect(quarantined.samples).toBe(0);
      expect(quarantined.path).not.toBe(result.path);
      expect(quarantined.excluded[0]?.reason).toBe('quarantined:before_frame_already_contains_unit');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
