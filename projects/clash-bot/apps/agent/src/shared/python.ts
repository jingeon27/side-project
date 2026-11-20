import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIR } from './data-dir.ts';

export const PYTHON_SOURCE_DIR = fileURLToPath(new URL('../../python', import.meta.url));

export function pythonExecutable(dataDir = DATA_DIR) {
  return process.env.CLASH_BOT_PYTHON ?? join(dataDir, 'python/.venv/bin/python');
}

export function pythonToolsExecutable() {
  return fileURLToPath(new URL('../../../../.data/python-tools/bin/python', import.meta.url));
}

export function pythonEnvironment(dataDir = DATA_DIR): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLASH_BOT_DATA_DIR: dataDir,
    PYTHONPATH: [PYTHON_SOURCE_DIR, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  };
}
