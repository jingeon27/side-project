import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DATA_DIR } from './config.ts';
import { LearningClient } from './learning-client.ts';
import { selectModel } from './model-options.ts';
import { prepareOpponentDataset } from './opponent-data.ts';
import { acquireLearningLock } from './selfplay.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { observations: { type: 'string' }, dataset: { type: 'string' }, model: { type: 'string' } },
});
const command = positionals[0];
if (command === 'prepare' && values.observations) {
  console.log(JSON.stringify(await prepareOpponentDataset(resolve(values.observations), DATA_DIR), null, 2));
} else if (command === 'train' && values.dataset) {
  const lock = await acquireLearningLock(join(DATA_DIR, 'qwen/selfplay'));
  const client = new LearningClient(DATA_DIR, selectModel(values.model, true).id);
  const close = () => client.close();
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    await client.ready();
    console.log(JSON.stringify(await client.imitate(resolve(values.dataset)), null, 2));
  } finally {
    process.removeListener('SIGINT', close);
    process.removeListener('SIGTERM', close);
    client.close();
    await lock.release();
  }
} else {
  throw new Error(
    'opponent prepare --observations <관찰.json> 또는 opponent train --dataset <dataset.json> [--model 3.8-27b]',
  );
}
