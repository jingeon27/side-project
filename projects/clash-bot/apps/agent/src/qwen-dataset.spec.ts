import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { exportEpisode } from './qwen-dataset.ts';

it('exports only inputs confirmed by both hand change and elixir consumption', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-episode-'));
  try {
    const rows = [
      ...[1, 2, 3].map((frame) => ({
        type: 'prediction',
        image: join(directory, `${frame}.png`),
        prompt: 'choose a legal action',
        text: '{"choice":1}',
      })),
      { type: 'input_check', frame: 1, changed: true, spent: 3 },
      { type: 'input_check', frame: 2, changed: false, spent: 3 },
      { type: 'input_check', frame: 3, changed: true, spent: 0 },
    ];
    await writeFile(join(directory, 'events.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n'));
    expect(await exportEpisode(directory, 'loss')).toBe(1);
    const sample = JSON.parse((await readFile(join(directory, 'trajectories.jsonl'), 'utf8')).trim());
    expect(sample).toMatchObject({
      reward: -1,
      outcome: 'loss',
      weightsUpdated: false,
      images: [join(directory, '1.png')],
      messages: [
        { role: 'user', content: 'choose a legal action' },
        { role: 'assistant', content: '{"choice":1}' },
      ],
    });
    await exportEpisode(directory, 'unknown');
    expect(
      JSON.parse((await readFile(join(directory, 'trajectories.jsonl'), 'utf8')).trim()).reward,
    ).toBeNull();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
