import { readFileSync } from 'node:fs';

import { z } from 'zod';

export const modelIdSchema = z.enum(['2b', '4b', '3.8-27b']);
export type ModelId = z.infer<typeof modelIdSchema>;
export const DEFAULT_MODEL: ModelId = '3.8-27b';
const specification = z.object({
  name: z.string(),
  repo: z.string(),
  revision: z.string(),
  directory: z.string(),
  checkpoint_directory: z.string(),
  identity: z.string().length(64),
  files: z.record(z.string(), z.string().length(64)),
  input_size: z.int().positive(),
  hidden_size: z.int().positive(),
  layers: z.int().positive(),
  tied_output: z.boolean(),
  memory_gib: z.number().positive(),
  learning: z.boolean(),
});
const models = z
  .record(modelIdSchema, specification)
  .parse(JSON.parse(readFileSync(new URL('./qwen/models.json', import.meta.url), 'utf8')));

export function selectModel(value: string = DEFAULT_MODEL, learning = false) {
  const id = modelIdSchema.parse(value);
  const spec = models[id];
  if (learning && !spec.learning) throw new Error('자가학습은 4b 또는 3.8-27b 모델을 사용하세요.');
  return { id, ...spec };
}
