import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import sharp from 'sharp';
import { z } from 'zod';

import { opponentObservationSchema, type OpponentObservation } from '../../core/battle/observation.ts';
import { cardIdSchema, type CardId } from '../../core/cards.ts';
import { COMBAT } from '../../core/combat-reference.ts';
import { HEIGHT, WIDTH } from '../../core/geometry.ts';
import type { QwenAction } from '../../core/policy/actions.ts';
import { serializeDecision } from '../../core/policy/decision-v3.ts';
import type { Profile } from '../../core/profile.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { inside } from '../../shared/paths.ts';
import { RESULT_LABEL } from '../../shared/qualification.ts';
import { mirrorActions, mirrorContext, reflectPoint } from './mirror-policy.ts';

// 경기 중 자동 추적한 상대 행동만 모방 자료가 된다. Python(clash_bot.qwen.opponent_data)도 같은 형식 이름을 읽는다.
export const DEMONSTRATION_FORMAT = 'counterpush-mirror-actor-demonstrations-v4';
export const opponentObservationsSchema = z
  .object({
    version: z.literal(1),
    source: z.literal('counterpush_live_screen'),
    actor: z.literal('red_top'),
    annotation: z.literal('automatic_dino_tracking'),
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
    observations: z.array(opponentObservationSchema).min(1).max(100),
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

export function observationExclusion(item: OpponentObservation): string | null {
  const gap = (item.after.capturedAt - item.before.capturedAt) / 1000;
  if (!item.verifiedActor || !item.absentBefore) return 'unverified_actor_or_new_action';
  if (item.confidence < 0.9) return 'low_visual_confidence';
  if (!Number.isFinite(gap) || gap <= 0 || gap > 10) return 'ambiguous_time_window';
  if (item.situation.at > item.before.capturedAt + 50) return 'future_context_leak';
  return null;
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

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const placementRegion = (profile: Profile, grounding: NonNullable<OpponentObservation['grounding']>) => {
  const [left, top, right, bottom] = z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .parse(grounding.box);
  return {
    ...reflectPoint(profile, grounding),
    radius: Math.max(24, Math.min(45, Math.max(right - left, bottom - top) * 0.35)),
  };
};
const observedRegion = (profile: Profile, item: OpponentObservation) => {
  if (!item.grounding) return null;
  const region = placementRegion(profile, item.grounding);
  if (['poison', 'graveyard', 'goblin_hut'].includes(item.card)) return region;
  const gap = item.after.capturedAt - item.before.capturedAt;
  if (!['ice_wizard', 'furnace', 'knight', 'skeletons'].includes(item.card) || gap > 1200) return null;
  const kind = item.card === 'skeletons' ? 'skeleton' : item.card;
  return { ...region, radius: region.radius + ((COMBAT.bodies[kind]?.speed ?? 2) * 17 * gap) / 1000 };
};

export async function prepareOpponentDataset(observationsPath: string, dataDir: string, profile: Profile) {
  const input = opponentObservationsSchema.parse(JSON.parse(await readFile(observationsPath, 'utf8')));
  if (input.deck.toSorted().join(',') !== profile.deck.toSorted().join(','))
    throw new Error('미러전과 다른 덱은 상대 행동 교사로 사용할 수 없습니다.');
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
    if (!inside(root, full)) throw new Error('관찰 폴더 밖의 이미지는 허용하지 않습니다.');
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
  const resultSchema = z.object({
    type: z.literal('result'),
    source: z.literal('counterpush_result_dom_verified2'),
    blue: z.int().min(0).max(3),
    red: z.int().min(0).max(3),
    readings: z.array(z.string()).length(2),
  });
  const qualification = z
    .object({ role: z.string() })
    .parse(JSON.parse(await readFile(join(root, 'qualification.json'), 'utf8')));
  if (qualification.role !== 'candidate_training')
    throw new Error('평가 경기는 상대 모방 학습에 사용할 수 없습니다.');
  const events = (await readFile(join(root, 'events.jsonl'), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => z.looseObject({ type: z.string() }).parse(JSON.parse(line)));
  if (events.some((event) => event.type === 'input_recovery'))
    records.forEach((record) => {
      record.excluded ??= 'input_recovery_episode';
    });
  const teacherResult =
    events
      .map((event) => resultSchema.safeParse(event))
      .filter((result) => result.success)
      .map((result) => result.data)
      .findLast((result) => {
        const label = RESULT_LABEL.exec(result.readings[0] ?? '');
        return (
          result.readings[0] === result.readings[1] &&
          label &&
          Number(label[1]) === result.blue &&
          Number(label[2]) === result.red &&
          result.red > result.blue
        );
      }) ?? null;
  const samples = [];
  for (const record of records) {
    if (record.excluded) continue;
    if (!teacherResult) {
      record.excluded = 'teacher_not_verified_winner';
      continue;
    }
    const item = record.observation;
    const actions = mirrorActions(profile, input.deck, item.situation)
      .map((action) => ({ action, order: digest(`${record.before.source_sha256}:${action.id}`) }))
      .toSorted((first, second) => first.order.localeCompare(second.order))
      .map(({ action }) => action);
    const region = observedRegion(profile, item);
    const positionTargets = region
      ? actions.filter(
          (action) =>
            action.card === item.card &&
            Math.hypot(action.target.x - region.x, action.target.y - region.y) <= region.radius,
        )
      : [];
    const labelKind = positionTargets.length ? 'placement_region' : 'card_lane';
    const targetIds = (
      positionTargets.length
        ? positionTargets
        : actions.filter((action) => macroMatches(action, item.card, item.lane))
    ).map((action) => action.id);
    if (!targetIds.length) {
      record.excluded = 'observed_action_inconsistent_with_before_candidates';
      continue;
    }
    const image = `images/${item.id}-before.png`;
    const evidenceImage = `images/${item.id}-after.png`;
    samples.push({
      id: item.id,
      image,
      evidence_image: evidenceImage,
      image_sha256: record.before.sha256,
      evidence_sha256: record.after.sha256,
      source_before_sha256: record.before.source_sha256,
      source_after_sha256: record.after.source_sha256,
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
      river_y: profile.riverY,
      label_kind: labelKind,
      target_region: labelKind === 'placement_region' ? region : null,
      prompt: serializeDecision(mirrorContext(profile, item.situation, actions)),
      choices: actions.map((action) => action.id),
      candidates: actions,
      target_ids: targetIds,
    });
  }
  const payload = {
    format: DEMONSTRATION_FORMAT,
    source: input.source,
    teacher_result: teacherResult,
    deck: input.deck,
    annotation: input.annotation,
    samples,
    excluded: records
      .filter((record) => record.excluded)
      .map((record) => ({ id: record.observation.id, reason: record.excluded })),
  };
  const identity = digest(JSON.stringify(payload));
  const dataset = { ...payload, id: identity };
  const directory = join(dataDir, 'counterpush/datasets', identity.slice(0, 24));
  await mkdir(join(directory, 'images'), { recursive: true, mode: 0o700 });
  const frames = new Map(records.map((record) => [record.observation.id, record]));
  for (const sample of samples) {
    const record = frames.get(sample.id);
    if (!record) throw new Error('미러 학습 표본의 원본 프레임이 없습니다.');
    await atomicWrite(join(directory, sample.image), record.before.normalized);
    await atomicWrite(join(directory, sample.evidence_image), record.after.normalized);
  }
  const path = join(directory, 'dataset.json');
  const serialized = JSON.stringify(dataset, null, 2) + '\n';
  await atomicWrite(path, serialized);
  return { path, sha256: digest(serialized), samples: samples.length, excluded: dataset.excluded };
}
