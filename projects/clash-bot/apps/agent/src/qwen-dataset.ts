import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { atomicWrite } from './assets.ts';

export async function exportEpisode(directory: string, outcome: string): Promise<number> {
  const rows = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const confirmed = new Set(
    rows
      .filter((row) => row.type === 'input_check' && row.changed && Number(row.spent) >= 1)
      .map((row) => Number(row.frame)),
  );
  const predictions = rows.filter(
    (row) => row.type === 'prediction' && confirmed.has(Number(basename(String(row.image), '.png'))),
  );
  const reward = outcome === 'win' ? 1 : outcome === 'loss' ? -1 : outcome === 'draw' ? 0 : null;
  const samples = predictions.map((row) => ({
    images: [row.image],
    messages: [
      { role: 'user', content: row.prompt },
      { role: 'assistant', content: row.text },
    ],
    reward,
    outcome,
    source: 'confirmed_screen_action',
    weightsUpdated: false,
  }));
  await atomicWrite(
    join(directory, 'trajectories.jsonl'),
    samples.map((sample) => JSON.stringify(sample)).join('\n') + (samples.length ? '\n' : ''),
  );
  return samples.length;
}
