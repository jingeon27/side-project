import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import sharp from 'sharp';
import { z } from 'zod';

import { atomicWrite } from './assets.ts';
import { cardIdSchema, DEFAULT_PROFILE, HEIGHT, WIDTH, type CardId } from './config.ts';
import { battleSituationSchema, type BattleSituation } from './counterpush/battle-state.ts';
import { actionCandidates, deckGuidance, type QwenAction } from './qwen-actions.ts';

export const DEMONSTRATION_FORMAT = 'counterpush-card-lane-demonstrations-v1';
const frameSchema = z
  .object({
    image: z.string().min(1),
    secondsRemaining: z.int().min(0).max(300).optional(),
    capturedAt: z.number().positive().optional(),
  })
  .refine(
    (frame) => frame.secondsRemaining !== undefined || frame.capturedAt !== undefined,
    '프레임 시각이 필요합니다.',
  );
export const opponentObservationsSchema = z
  .object({
    version: z.literal(1),
    source: z.literal('counterpush_live_screen'),
    actor: z.literal('red_top'),
    annotation: z.enum(['codex_visual_card_and_lane_only', 'automatic_dino_tracking']).optional(),
    deck: z
      .array(cardIdSchema)
      .length(8)
      .refine((cards) => new Set(cards).size === 8),
    crop: z.object({
      x: z.int().nonnegative(),
      y: z.int().nonnegative(),
      width: z.int().positive(),
      height: z.int().positive(),
    }),
    observations: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
          before: frameSchema,
          after: frameSchema,
          card: cardIdSchema,
          lane: z.enum(['left', 'right', 'center']),
          evidence: z.enum(['new_unit_visible', 'spell_effect_visible']),
          confidence: z.number().min(0).max(1),
          verifiedActor: z.boolean(),
          absentBefore: z.boolean(),
          context: z.string().max(500),
          grounding: z
            .object({ x: z.number(), y: z.number(), box: z.array(z.number()).length(4) })
            .optional(),
          situation: battleSituationSchema.optional(),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (new Set(data.observations.map((item) => item.id)).size !== data.observations.length)
      ctx.addIssue({ code: 'custom', message: '관찰 ID가 중복됩니다.' });
    data.observations.forEach((item, index) => {
      if (!data.deck.includes(item.card))
        ctx.addIssue({
          code: 'custom',
          message: '관찰 카드가 상대 덱에 없습니다.',
          path: ['observations', index, 'card'],
        });
    });
  });
export type OpponentObservation = z.infer<typeof opponentObservationsSchema>['observations'][number];

export function observationExclusion(item: OpponentObservation): string | null {
  const gap =
    item.before.capturedAt !== undefined && item.after.capturedAt !== undefined
      ? (item.after.capturedAt - item.before.capturedAt) / 1000
      : Number(item.before.secondsRemaining) - Number(item.after.secondsRemaining);
  if (!item.verifiedActor || !item.absentBefore) return 'unverified_actor_or_new_action';
  if (item.confidence < 0.9) return 'low_visual_confidence';
  if (!Number.isFinite(gap) || gap <= 0 || gap > 10) return 'ambiguous_time_window';
  if (
    item.situation &&
    item.before.capturedAt !== undefined &&
    item.situation.at > item.before.capturedAt + 50
  )
    return 'future_context_leak';
  return null;
}

export function opponentActions(deck: CardId[]): QwenAction[] {
  // A deck-wide intent list is used only for demonstrations. Hidden hands and
  // elixir are never presented as known or sent to a live input controller.
  const profile = { ...DEFAULT_PROFILE, riverY: 276, arena: { x: 15, y: 80, width: 338, height: 385 } };
  return [
    { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' },
    ...actionCandidates(profile, deck, 10, []).map((action) => ({
      ...action,
      slot: 0,
      target: { x: action.target.x, y: profile.riverY * 2 - action.target.y },
    })),
  ];
}

export function macroMatches(action: QwenAction, card: CardId, lane: OpponentObservation['lane']): boolean {
  return (
    action.card === card &&
    (lane === 'center'
      ? action.target.x === 184
      : lane === 'left'
        ? action.target.x < 184
        : action.target.x > 184)
  );
}

export function opponentPrompt(deck: CardId[], actions: QwenAction[], situation?: BattleSituation): string {
  const state = situation
    ? `Structured BEFORE state uses own=BLUE bottom and opponent=RED top: ${JSON.stringify(situation)}. Predict RED's response to BLUE's unit types, positions and recent plays. Exact RED hand/elixir remain hidden: use the provided ranges and FIFO hypotheses within their uncertainty. Both regenerate equally and cap at 10 with no stored overflow. Each deck has 8 cards, a 4-card hand and 4-card FIFO draw queue; a played card returns after 4 subsequent plays.`
    : '';
  return (
    state +
    `Card knowledge: ${JSON.stringify(deckGuidance(deck))}. ` +
    `Observe Clash Royale from RED top's perspective. BLUE bottom is the opponent. Predict ONE next card-and-lane intent from RED's publicly visible board. RED hand=UNKNOWN; RED elixir=UNKNOWN. Known RED deck: ${deck.join(', ')}. The list contains deck-wide possibilities, not a verified legal hand. Coordinates are in a ${WIDTH}x${HEIGHT} image. Targets are lane exemplars; exact deployment time and position are unknown. Learn the observed behavior without assuming it is optimal. Reply with exactly ONE action letter, no explanation. Actions: ${JSON.stringify(actions.map((action, index) => ({ id: String.fromCharCode(65 + index), card: action.card, description: action.description, target: action.target })))}.`
  );
}

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export async function prepareOpponentDataset(observationsPath: string, dataDir: string) {
  const input = opponentObservationsSchema.parse(JSON.parse(await readFile(observationsPath, 'utf8')));
  const quarantineText = await readFile(join(dataDir, 'counterpush/quarantine.json'), 'utf8').catch(
    (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    },
  );
  const quarantine = quarantineText
    ? z
        .object({
          version: z.literal(1),
          entries: z.array(
            z.object({
              before_sha256: z.string().regex(/^[a-f0-9]{64}$/),
              card: cardIdSchema,
              reason: z.string().min(1).max(200),
            }),
          ),
        })
        .parse(JSON.parse(quarantineText)).entries
    : [];
  const root = await realpath(dirname(observationsPath));
  const readFrame = async (path: string) => {
    const full = await realpath(resolve(root, path));
    const local = relative(root, full);
    if (isAbsolute(local) || local.startsWith('..'))
      throw new Error('관찰 폴더 밖의 이미지는 허용하지 않습니다.');
    const bytes = await readFile(full);
    const metadata = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      input.crop.x + input.crop.width > metadata.width ||
      input.crop.y + input.crop.height > metadata.height
    )
      throw new Error('게임 화면 영역이 관찰 이미지 밖입니다.');
    const normalized = await sharp(bytes)
      .extract({ left: input.crop.x, top: input.crop.y, width: input.crop.width, height: input.crop.height })
      .resize(WIDTH, HEIGHT, { fit: 'fill' })
      .removeAlpha()
      .png()
      .toBuffer();
    return { normalized, source_sha256: digest(bytes), sha256: digest(normalized) };
  };
  const records = [];
  for (const observation of input.observations) {
    const before = await readFrame(observation.before.image);
    const after = await readFrame(observation.after.image);
    const blocked = quarantine.find(
      (entry) => entry.card === observation.card && entry.before_sha256 === before.source_sha256,
    );
    records.push({
      observation,
      before,
      after,
      excluded: blocked ? `quarantined:${blocked.reason}` : observationExclusion(observation),
    });
  }
  const intentPool = opponentActions(input.deck);
  const identity = digest(
    JSON.stringify({
      input,
      images: records.map((record) => [record.before.source_sha256, record.after.source_sha256]),
      exclusions: records.map((record) => record.excluded),
      intents: intentPool,
      prompts: records.map((record) => opponentPrompt(input.deck, intentPool, record.observation.situation)),
    }),
  );
  const directory = join(dataDir, 'counterpush/datasets', identity.slice(0, 24));
  await mkdir(join(directory, 'images'), { recursive: true, mode: 0o700 });
  const samples = [];
  for (const record of records) {
    if (record.excluded) continue;
    const item = record.observation;
    const actions = intentPool
      .map((action) => ({ action, order: digest(`${identity}:${item.id}:${action.id}`) }))
      .toSorted((first, second) => first.order.localeCompare(second.order))
      .map(({ action }) => action);
    const targetIds = actions
      .filter((action) => macroMatches(action, item.card, item.lane))
      .map((action) => action.id);
    if (!targetIds.length) throw new Error(`${item.id}: 관찰 행동에 맞는 카드·방향 후보가 없습니다.`);
    const image = `images/${item.id}-before.png`;
    const evidenceImage = `images/${item.id}-after.png`;
    await atomicWrite(join(directory, image), record.before.normalized);
    await atomicWrite(join(directory, evidenceImage), record.after.normalized);
    samples.push({
      id: item.id,
      image,
      evidence_image: evidenceImage,
      image_sha256: record.before.sha256,
      evidence_sha256: record.after.sha256,
      source_before_sha256: record.before.source_sha256,
      source_after_sha256: record.after.source_sha256,
      before_seconds: item.before.secondsRemaining,
      after_seconds: item.after.secondsRemaining,
      before_at: item.before.capturedAt,
      after_at: item.after.capturedAt,
      actor: input.actor,
      hand: null,
      elixir: null,
      exact_target: null,
      card: item.card,
      lane: item.lane,
      confidence: item.confidence,
      evidence: item.evidence,
      verified_actor: item.verifiedActor,
      absent_before: item.absentBefore,
      context: item.context,
      grounding: item.grounding,
      situation: item.situation,
      prompt: opponentPrompt(input.deck, actions, item.situation),
      choices: actions.map((action) => action.id),
      candidates: actions,
      target_ids: targetIds,
    });
  }
  const dataset = {
    format: DEMONSTRATION_FORMAT,
    source: input.source,
    id: identity,
    annotation: input.annotation ?? 'codex_visual_card_and_lane_only',
    samples,
    excluded: records
      .filter((record) => record.excluded)
      .map((record) => ({ id: record.observation.id, reason: record.excluded })),
  };
  const path = join(directory, 'dataset.json');
  await atomicWrite(path, JSON.stringify(dataset, null, 2) + '\n');
  return { path, samples: samples.length, excluded: dataset.excluded };
}
