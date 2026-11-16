import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { cardIdSchema } from '../../core/cards.ts';

// 저장소가 검토·소유하는 Counterpush 손패 그림이다. 실행기는 복사본이 아니라 이 폴더를 직접 읽는다.
export const HAND_REFERENCE_DIRECTORY = fileURLToPath(
  new URL('../../../assets/counterpush/hand-templates/', import.meta.url),
);

const stateSchema = z.enum(['normal', 'evolution', 'disabled']);
const referenceSchema = z
  .object({
    path: z.string(),
    card: cardIdSchema,
    state: stateSchema,
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    source: z
      .object({ frame: z.string(), sameHandWithoutInterveningCardInput: z.boolean() })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (reference) =>
      reference.path === `${reference.card}.png`
        ? reference.state === 'normal'
        : new RegExp(`^variants/${reference.card}/${reference.state}-\\d+\\.png$`).test(reference.path),
    '손패 참조 경로는 <카드>.png(normal) 또는 variants/<카드>/<상태>-<번호>.png여야 합니다.',
  );
const manifestSchema = z
  .object({
    format: z.literal(2),
    source: z.string(),
    references: z.array(referenceSchema),
    missing: z.array(z.object({ card: cardIdSchema, state: stateSchema }).strict()),
  })
  .strict();

export async function loadHandReferences(directory = HAND_REFERENCE_DIRECTORY) {
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')));
  const references = await Promise.all(
    manifest.references.map(async (reference) => {
      const bytes = await readFile(join(directory, reference.path));
      if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256)
        throw new Error(`손패 참조 이미지가 manifest의 SHA-256과 다릅니다: ${reference.path}`);
      return { ...reference, bytes };
    }),
  );
  return { ...manifest, references };
}
