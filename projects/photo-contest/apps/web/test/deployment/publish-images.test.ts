import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../../../../', import.meta.url));
const sha = 'a'.repeat(40);

function publishStep(service: string) {
  const workflow = readFileSync(join(repo, '.github/workflows/services.yml'), 'utf8');
  const prefix = service === 'game-feedback' ? 'gf' : 'pc';
  const publish = workflow.split(`\n  ${prefix}-publish:\n`)[1]?.split(`\n  ${prefix}-deploy:\n`)[0];
  const script = publish?.split('        run: |\n').at(-1);
  if (!script) throw new Error('Image publication step not found.');
  const lines = script.split('\n');
  const end = lines.findIndex((line) => line !== '' && !line.startsWith('          '));
  return lines
    .slice(0, end < 0 ? lines.length : end)
    .map((line) => line.slice(10))
    .join('\n');
}

// Docker 아카이브에 남은 기존 이름을 먼저 반환하고, 실제 push한 GHCR 이름을 마지막에 둔다.
const docker = `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  load) cat >/dev/null ;;
  tag|push) ;;
  image)
    image=\${!#}
    repository=\${image%:*}
    hash=$(printf 'b%.0s' {1..64})
    if [[ "$repository" == *-web ]]; then hash=$(printf 'c%.0s' {1..64}); fi
    legacy="local-image@sha256:$hash"
    if [[ "$*" == *'{{index .RepoDigests 0}}'* ]]; then printf '%s\\n' "$legacy"; exit 0; fi
    if [[ "\${DIGEST_MODE:-}" == missing ]]; then printf '["%s"]\\n' "$legacy"; exit 0; fi
    if [[ "\${DIGEST_MODE:-}" == ambiguous ]]; then
      printf '["%s@sha256:%s","%s@sha256:%s"]\\n' "$repository" "$hash" "$repository" "$(printf 'd%.0s' {1..64})"
      exit 0
    fi
    printf '["%s","ghcr.io/other/project@sha256:%s","%s@sha256:%s"]\\n' "$legacy" "$hash" "$repository" "$hash"
    ;;
  *) exit 2 ;;
esac
`;

function publish(service: string, mode = '') {
  const root = mkdtempSync(join(tmpdir(), 'publish-images-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), docker, { mode: 0o700 });
    for (const [directory, archive] of [
      ['shared-images', 'game-feedback.tar.gz'],
      ['photo-contest-images', 'photo-contest-images.tar.gz'],
    ] as const) {
      mkdirSync(join(root, directory));
      writeFileSync(join(root, directory, archive), gzipSync('verified image archive fixture'));
    }
    const output = join(root, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', publishStep(service)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: root,
        IMAGE_PREFIX: `ghcr.io/jingeon27/side-project-${service}`,
        GITHUB_SHA: sha,
        GITHUB_OUTPUT: output,
        DIGEST_MODE: mode,
      },
    });
    return { status: result.status, stderr: result.stderr, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe.each(['game-feedback', 'photo-contest'])('%s 이미지 발행', (service) => {
  it('기존 이름의 순서와 관계없이 push한 GHCR 저장소의 digest를 배포 출력으로 전달해야 한다', () => {
    const result = publish(service);
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toBe(
      `api_image=ghcr.io/jingeon27/side-project-${service}-api@sha256:${'b'.repeat(64)}\n` +
        `web_image=ghcr.io/jingeon27/side-project-${service}-web@sha256:${'c'.repeat(64)}\n`,
    );
  });

  it.each(['missing', 'ambiguous'])(
    'digest가 %s 상태이면 임의의 이름을 전달하지 않고 실패해야 한다',
    (mode) => {
      const result = publish(service, mode);
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('');
    },
  );
});
