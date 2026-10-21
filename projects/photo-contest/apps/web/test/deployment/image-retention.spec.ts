import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../../../../deploy/shared-instance/scripts/prune-images.py', import.meta.url),
);
const state = {} as { root: string; protected: string[] };
const ref = (service: string, app: string, digit: string) =>
  `ghcr.io/jingeon27/side-project-${service}-${app}@sha256:${digit.repeat(64)}`;

beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), 'side-image-retention-'));
  state.protected = [];
  mkdirSync(join(state.root, 'bin'));
  ['game-feedback', 'photo-contest'].forEach((service, index) => {
    const base = join(state.root, 'services', service);
    ['current', 'previous'].forEach((name, offset) => {
      const digit = String(index * 2 + offset + 1);
      const directory = join(base, 'releases', digit.repeat(40));
      mkdirSync(directory, { recursive: true });
      const api = ref(service, 'api', digit);
      const web = ref(service, 'web', digit);
      state.protected.push(api, web);
      writeFileSync(join(directory, '.release.env'), `API_IMAGE=${api}\nWEB_IMAGE=${web}\n`);
      symlinkSync(directory, join(base, name));
    });
  });
  writeFileSync(join(state.root, 'removed'), '');
  writeFileSync(
    join(state.root, 'bin/docker'),
    `#!/usr/bin/env python3
import datetime, json, os, pathlib, sys
root = pathlib.Path(os.environ['SIDE_DEPLOY_ROOT'])
images = json.loads((root / 'images.json').read_text())
args = sys.argv[1:]
if args[:2] == ['image', 'ls']:
    print('\\n'.join(images))
elif args[:2] == ['image', 'inspect']:
    print(json.dumps([{'Created': images[args[2]]}]))
elif args[:2] == ['image', 'rm'] and len(args) == 3:
    with (root / 'removed').open('a') as output: output.write(args[2] + '\\n')
else:
    raise SystemExit('Unexpected Docker operation')
`,
    { mode: 0o700 },
  );
});
afterEach(() => rmSync(state.root, { recursive: true, force: true }));

const execute = (images: Record<string, string>) => {
  writeFileSync(join(state.root, 'images.json'), JSON.stringify(images));
  return spawnSync('python3', [script], {
    encoding: 'utf8',
    env: { ...process.env, SIDE_DEPLOY_ROOT: state.root, PATH: `${state.root}/bin:${process.env.PATH}` },
  });
};

describe('공유 호스트 이미지 보존', () => {
  it('양쪽 서비스의 current와 previous, 최근 이미지, 다른 저장소는 보존해야 한다', () => {
    const old = '2020-01-01T00:00:00Z';
    const eligible = ref('game-feedback', 'web', 'a');
    const recent = ref('photo-contest', 'api', 'b');
    const result = execute({
      ...Object.fromEntries(state.protected.map((image) => [image, old])),
      [eligible]: old,
      [recent]: new Date().toISOString(),
      'ghcr.io/another/project-api@sha256:unowned': old,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(state.root, 'removed'), 'utf8').trim().split('\n')).toEqual([eligible]);
  });
  it('한 서비스라도 current가 없으면 어떤 이미지도 지우지 않아야 한다', () => {
    rmSync(join(state.root, 'services/photo-contest/current'));
    const result = execute({ [ref('game-feedback', 'api', 'a')]: '2020-01-01T00:00:00Z' });
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(state.root, 'removed'), 'utf8')).toBe('');
  });
  it('릴리스 디렉터리 밖을 가리키는 포인터는 거부해야 한다', () => {
    const current = join(state.root, 'services/game-feedback/current');
    rmSync(current);
    symlinkSync(state.root, current);
    const result = execute({ [ref('photo-contest', 'api', 'a')]: '2020-01-01T00:00:00Z' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unowned release path');
    expect(readFileSync(join(state.root, 'removed'), 'utf8')).toBe('');
  });
});
