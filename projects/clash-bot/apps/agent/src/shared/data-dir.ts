import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = process.env.CLASH_BOT_DATA_DIR
  ? resolve(process.env.CLASH_BOT_DATA_DIR)
  : fileURLToPath(new URL('../../../../.data', import.meta.url));
