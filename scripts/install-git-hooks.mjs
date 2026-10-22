// Root `postinstall`. Yarn 4 does not run `prepare`, so Husky's Yarn guide installs hooks here.
// Exit quietly where hooks cannot or should not exist: HUSKY=0, CI, Docker contexts without `.git`,
// and installs that skip root devDependencies (`yarn workspaces focus … --production`).
import { existsSync } from 'node:fs';

const { CI, HUSKY } = process.env;
const ci = Boolean(CI) && CI !== '0' && CI !== 'false';

if (HUSKY !== '0' && !ci && existsSync('.git')) {
  const husky = await import('husky').then(
    (module) => module.default,
    (error) => {
      if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
      throw error;
    },
  );
  // Husky reports problems such as a missing git binary as text instead of failing the install.
  const message = husky?.();
  if (message) console.log(`husky - ${message}`);
}
