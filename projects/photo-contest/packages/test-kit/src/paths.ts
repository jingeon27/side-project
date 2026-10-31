import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** projects/photo-contest */
export const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const API_ROOT = dirname(require.resolve('@photo-contest/api/package.json'));
export const PRISMA_CONFIG = require.resolve('@photo-contest/api/prisma.config.ts');
export const PRISMA_CLI = require.resolve('prisma/build/index.js');
export const SERVE_TEST_API_BIN = fileURLToPath(new URL('../bin/serve-test-api.ts', import.meta.url));
