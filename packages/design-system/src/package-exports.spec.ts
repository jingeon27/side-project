import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// 공개 하위 경로의 타입도 typecheck에서 해석되는지 확인한다.
import type { IAvatarProps } from '@side/design-system/ui/avatar';
import type { IBadgeProps, TBadgeTone } from '@side/design-system/ui/badge';
import type { IButtonProps } from '@side/design-system/ui/button';
import type { IDialogProps } from '@side/design-system/ui/dialog';
import type { IFormFieldProps } from '@side/design-system/ui/form-field';
import type { IIconButtonProps } from '@side/design-system/ui/icon-button';
import type { ISpinnerProps } from '@side/design-system/ui/spinner';
import type { ITextAreaFieldProps, ITextFieldProps } from '@side/design-system/ui/text-field';

const srcDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(srcDir, '../package.json'), 'utf8')) as {
  exports: Record<string, string>;
};
const uiFolders = readdirSync(join(srcDir, 'ui'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

async function importSubpath(subpath: string): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ `@side/design-system/${subpath}`);
}

export type TPublicTypes = [
  IAvatarProps,
  IBadgeProps,
  TBadgeTone,
  IButtonProps,
  IDialogProps,
  IFormFieldProps,
  IIconButtonProps,
  ISpinnerProps,
  ITextAreaFieldProps,
  ITextFieldProps,
];

describe('package exports', () => {
  it('./ui/* 패턴이 가리키는 모든 폴더에 index.ts가 있어야 한다', () => {
    expect(packageJson.exports['./ui/*']).toBe('./src/ui/*/index.ts');
    for (const folder of uiFolders) {
      expect.soft(existsSync(join(srcDir, 'ui', folder, 'index.ts')), folder).toBe(true);
    }
  });

  it.each(uiFolders)('ui/%s를 패키지 이름으로 가져올 수 있어야 한다', async (folder) => {
    const module = await importSubpath(`ui/${folder}`);
    expect(Object.keys(module).length).toBeGreaterThan(0);
  });

  it('루트 진입점의 공개 값은 같은 객체로 하위 경로에서도 가져올 수 있어야 한다', async () => {
    const root = await importSubpath('ui');
    const subpaths = await Promise.all(
      [...uiFolders.map((folder) => `ui/${folder}`), 'lib/cn.helper'].map(importSubpath),
    );
    const reachable = new Map(subpaths.flatMap((module) => Object.entries(module)));
    for (const [name, value] of Object.entries(root)) {
      expect.soft(reachable.get(name), name).toBe(value);
    }
  });

  it('Next 전용 ButtonLink는 /next에만 있어야 한다', async () => {
    const [root, next] = await Promise.all([importSubpath('ui'), importSubpath('next')]);
    expect(root).not.toHaveProperty('ButtonLink');
    expect(next).toHaveProperty('ButtonLink');
  });
});
