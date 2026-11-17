import { expect, it } from 'vitest';

import { MODEL } from './model.ts';

it('pins Qwen3.8-27B with its own model and learning folders', () => {
  expect(MODEL).toMatchObject({
    name: 'Qwen3.8-27B',
    directory: 'model-3.8-27b',
    checkpoint_directory: 'learning-3.8-27b',
    hidden_size: 5120,
    layers: 64,
  });
  expect(Object.keys(MODEL.files)).toHaveLength(3);
});
