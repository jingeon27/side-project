import { readFileSync } from 'node:fs';

import { z } from 'zod';

const modelSchema = z.strictObject({
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
  memory_gib: z.number().positive(),
});

// TS와 Python이 함께 읽는 고정 Qwen 모델 사양이다.
export const MODEL = modelSchema.parse(
  JSON.parse(readFileSync(new URL('../../contracts/model.json', import.meta.url), 'utf8')),
);
