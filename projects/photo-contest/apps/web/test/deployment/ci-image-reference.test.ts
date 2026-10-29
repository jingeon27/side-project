import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../../../../deploy/shared-instance/scripts/ci-image-reference.sh', import.meta.url),
);
const release = 'c'.repeat(40);
const digest = 'a'.repeat(64);

function inspectReference(references: string[], options: { image?: string; status?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'side-image-reference-'));
  const log = join(directory, 'docker.log');
  try {
    writeFileSync(
      join(directory, 'docker'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TEST_DOCKER_LOG"\nprintf "%s\\n" "$TEST_DOCKER_REFERENCES"\nexit "$TEST_DOCKER_STATUS"\n',
      { mode: 0o700 },
    );
    const result = spawnSync('bash', [script, options.image ?? `ghcr.io/example/project-api:${release}`], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        TEST_DOCKER_LOG: log,
        TEST_DOCKER_REFERENCES: references.join('\n'),
        TEST_DOCKER_STATUS: String(options.status ?? 0),
      },
    });
    return { ...result, calls: existsSync(log) ? readFileSync(log, 'utf8') : '' };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('게시한 컨테이너 이미지 주소', () => {
  it.each([
    ['game-feedback', 'api', 'side-shared-gf-api'],
    ['game-feedback', 'web', 'side-shared-gf-web'],
    ['photo-contest', 'api', 'photo-contest-api'],
    ['photo-contest', 'web', 'photo-contest-web'],
  ])('%s %s의 로컬 digest보다 실제 GHCR 저장소 주소를 선택해야 한다', (service, app, localName) => {
    const repository = `ghcr.io/example/project-${service}-${app}`;
    const reference = `${repository}@sha256:${digest}`;
    const result = inspectReference([`${localName}@sha256:${'b'.repeat(64)}`, reference], {
      image: `${repository}:${release}`,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(reference);
    expect(result.calls).toContain('{{range .RepoDigests}}{{println .}}{{end}}');
  });

  it('다른 GHCR 저장소의 주소나 비슷한 접미사를 선택하지 않아야 한다', () => {
    const reference = `ghcr.io/example/project-api@sha256:${digest}`;
    const result = inspectReference([
      `ghcr.io/another/project-api@sha256:${digest}`,
      `ghcr.io/example/project-api-extra@sha256:${digest}`,
      reference,
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(reference);
  });

  it.each([
    { references: [] },
    { references: [`project-api@sha256:${digest}`] },
    { references: ['ghcr.io/example/project-api@sha256:invalid'] },
  ])('정확한 저장소의 유효한 digest가 없으면 배포 주소를 출력하지 않아야 한다: %j', ({ references }) => {
    const result = inspectReference(references);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('No digest matches');
  });

  it('같은 저장소의 digest가 둘 이상이면 임의로 고르지 않아야 한다', () => {
    const result = inspectReference([
      `ghcr.io/example/project-api@sha256:${digest}`,
      `ghcr.io/example/project-api@sha256:${'b'.repeat(64)}`,
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('More than one digest');
  });

  it('Docker 조회가 실패하면 그 출력으로 배포를 진행하지 않아야 한다', () => {
    const result = inspectReference([`ghcr.io/example/project-api@sha256:${digest}`], { status: 1 });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it.each(['project-api:latest', `docker.io/example/project-api:${release}`])(
    '잘못된 게시 대상은 Docker 조회 전에 거부해야 한다: %s',
    (image) => {
      const result = inspectReference([], { image });
      expect(result.status).not.toBe(0);
      expect(result.calls).toBe('');
      expect(result.stderr).toContain('Expected a GHCR image');
    },
  );
});
