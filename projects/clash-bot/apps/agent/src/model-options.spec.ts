import { expect, it } from 'vitest';

import { selectModel } from './model-options.ts';

it('defaults to Qwen3.8 with its own model and learning files', () => {
  const current = selectModel(undefined, true);
  const previous = selectModel('4b', true);
  expect(current).toMatchObject({
    id: '3.8-27b',
    name: 'Qwen3.8-27B',
    tied_output: false,
    hidden_size: 5120,
    layers: 64,
  });
  expect(current.directory).not.toBe(previous.directory);
  expect(current.checkpoint_directory).not.toBe(previous.checkpoint_directory);
  expect(current.identity).not.toBe(previous.identity);
});

it('rejects unsupported model names and the inference-only 2B learner', () => {
  expect(() => selectModel('unknown')).toThrow();
  expect(() => selectModel('2b', true)).toThrow('자가학습');
  expect(selectModel('2b').learning).toBe(false);
});
