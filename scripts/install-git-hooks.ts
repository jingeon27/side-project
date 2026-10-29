// Root `postinstall`. Yarn 4 does not run `prepare`, so Husky's Yarn guide installs hooks here.
// Exit quietly where hooks cannot or should not exist: HUSKY=0, CI, Docker contexts without `.git`,
// and installs that skip root devDependencies (`yarn workspaces focus … --production`).
import { existsSync } from 'node:fs';

import { copyWorktreeEnv } from './copy-worktree-env.ts';

const { CI, HUSKY } = process.env;
const ci = Boolean(CI) && CI !== '0' && CI !== 'false';

if (!ci && existsSync('.git')) {
  const copied = copyWorktreeEnv(process.cwd());
  if (copied.length) console.log(`worktree: 로컬 환경 파일 ${copied.length}개 복사 (기존 파일 보존)`);
}

if (HUSKY !== '0' && !ci && existsSync('.git')) {
  const husky = await import('husky').then(
    (module) => module.default,
    (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') return null;
      throw error;
    },
  );
  // Husky reports problems such as a missing git binary as text instead of failing the install.
  const message = husky?.();
  if (message) console.log(`husky - ${message}`);
}
