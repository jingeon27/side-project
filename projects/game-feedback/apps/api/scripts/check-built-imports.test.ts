import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkBuiltImports } from './check-built-imports';

describe('operational script imports after an API build', () => {
  it('rejects an import that was not moved with its compiled service', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gf-built-imports-'));
    const scripts = join(directory, 'scripts');
    mkdirSync(scripts);
    mkdirSync(join(directory, 'dist/posts/views'), { recursive: true });
    writeFileSync(join(directory, 'dist/posts/views/post-views.service.js'), 'module.exports = {};');
    const script = join(scripts, 'maintenance.ts');
    try {
      writeFileSync(script, "require('../dist/posts/post-views.service.js');");
      expect(() => checkBuiltImports(scripts)).toThrow(/post-views.service/);
      writeFileSync(script, "require('../dist/posts/views/post-views.service.js');");
      expect(() => checkBuiltImports(scripts)).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
