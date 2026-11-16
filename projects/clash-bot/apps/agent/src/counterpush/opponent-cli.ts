import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { acquireLearningLock } from '../android/runtime/selfplay.ts';
import { LearningClient } from '../qwen/learning-client.ts';
import { selectModel } from '../qwen/model-options.ts';
import { DATA_DIR } from '../shared/config.ts';
import { prepareOpponentDataset } from './learning/opponent-data.ts';

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
