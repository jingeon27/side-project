import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DATA_DIR } from '../shared/config.ts';
import { prepareOpponentDataset } from './learning/opponent-data.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { observations: { type: 'string' } },
});
if (positionals[0] !== 'prepare' || !values.observations)
  throw new Error('opponent prepare --observations <관찰.json>');
console.log(JSON.stringify(await prepareOpponentDataset(resolve(values.observations), DATA_DIR), null, 2));
