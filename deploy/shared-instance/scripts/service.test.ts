import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serviceScript = fileURLToPath(new URL('./service.sh', import.meta.url));
const currentSHA = 'a'.repeat(40);
const targetSHA = 'b'.repeat(40);
const image = (kind: string) => `ghcr.io/example/side-game-feedback-${kind}@sha256:${'c'.repeat(64)}`;

// 실제 서버와 Docker를 건드리지 않고, exec 실패 직후 inspect가 running을 반환하는 순서를 재현한다.
const dockerFixture = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >>"$FIXTURE_ROOT/commands"
case "$1" in
  version) printf '25.0.0\\n'; exit 0 ;;
  image) exit 0 ;;
  inspect)
    if [[ "$3" == '{{.State.Status}}' ]]; then printf 'running\\n'; fi
    exit 0 ;;
esac
shift
release=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-name|--env-file) shift 2 ;;
    -f) release=$(basename "$(dirname "$2")"); shift 2 ;;
    *) break ;;
  esac
done
case "$1" in
  ps) printf 'web-container\\n' ;;
  exec)
    if [[ "$*" == *side-web-draining* && "$(cat "$FIXTURE_ROOT/state")" == restarting ]]; then
      printf 'Container is restarting, wait until the container is running\\n' >&2
      exit 1
    fi
    if [[ "$*" == *health-check/live* && "\${FAIL_RECOVERY_HEALTH:-0}" == 1 ]]; then exit 1; fi ;;
  up)
    if [[ "\${FAIL_RECOVERY_UP:-0}" == 1 && "$release" != "$FAIL_RELEASE" ]]; then exit 1; fi
    if [[ "\${!#}" == web ]]; then
      if [[ "$release" == "$FAIL_RELEASE" ]]; then
        printf 'restarting\\n' >"$FIXTURE_ROOT/state"
        exit 1
      fi
      printf 'healthy\\n' >"$FIXTURE_ROOT/state"
    fi ;;
esac
`;

interface IScenario {
  action: 'deploy' | 'rollback';
  startingState?: 'healthy' | 'restarting';
  failure?: 'up' | 'health';
}

function runScenario(scenario: IScenario) {
  const root = mkdtempSync(join(tmpdir(), 'service-recovery-'));
  const service = join(root, 'services/game-feedback');
  const binary = join(root, 'bin');
  mkdirSync(join(root, 'database'), { recursive: true });
  mkdirSync(binary);
  writeFileSync(join(root, '.env'), '');
  writeFileSync(join(root, 'database/compose.yaml'), '');
  const releaseDirectory = (sha: string) => join(service, 'releases', sha);
  for (const sha of [currentSHA, targetSHA]) {
    const release = releaseDirectory(sha);
    mkdirSync(join(release, 'host'), { recursive: true });
    writeFileSync(join(release, 'compose.yaml'), '');
    writeFileSync(join(release, '.release.env'), '');
    writeFileSync(join(release, 'host/pg-backup.sh'), 'exit 0\n');
  }
  writeFileSync(join(service, '.env'), '');
  symlinkSync(releaseDirectory(currentSHA), join(service, 'current'));
  if (scenario.action === 'rollback') symlinkSync(releaseDirectory(targetSHA), join(service, 'previous'));
  writeFileSync(join(root, 'state'), scenario.startingState ?? 'healthy');
  writeFileSync(join(binary, 'docker'), dockerFixture, { mode: 0o700 });
  for (const name of ['flock', 'sleep']) {
    writeFileSync(join(binary, name), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o700 });
  }
  try {
    const args = scenario.action === 'deploy' ? [targetSHA, image('api'), image('web')] : [];
    const result = spawnSync('bash', [serviceScript, 'game-feedback', scenario.action, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${binary}:${process.env.PATH}`,
        SIDE_DEPLOY_ROOT: root,
        SIDE_LOCAL_IMAGES: '1',
        SIDE_DEPLOY_REQUEST: '',
        FIXTURE_ROOT: root,
        FAIL_RELEASE: targetSHA,
        FAIL_RECOVERY_UP: scenario.failure === 'up' ? '1' : '0',
        FAIL_RECOVERY_HEALTH: scenario.failure === 'health' ? '1' : '0',
      },
    });
    return {
      ...result,
      commands: readFileSync(join(root, 'commands'), 'utf8'),
      current: readlinkSync(join(service, 'current')),
      currentDirectory: releaseDirectory(currentSHA),
      targetDirectory: releaseDirectory(targetSHA),
      state: readFileSync(join(root, 'state'), 'utf8').trim(),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('실패한 교체 컨테이너의 재시작 중 서비스 복구', () => {
  it.each(['deploy', 'rollback'] as const)(
    '%s 실패 뒤 drain 상태 경쟁에 관계없이 기존 이미지를 복구한다',
    (action) => {
      const result = runScenario({ action });
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain('Container is restarting');
      expect(result.stdout).toContain('Skipping failed web drain while recovering');
      expect(result.commands).not.toContain('inspect --format {{.State.Status}}');
      expect(result.current).toBe(result.currentDirectory);
      expect(result.state).toBe('healthy');
      expect(result.commands).toContain('health-check/live');
      if (action === 'deploy') expect(result.stderr).toContain('Previous application images restored.');
    },
  );

  it('일반 배포에서는 실행 중인 앱의 drain 실패를 무시하고 새 이미지를 올리지 않는다', () => {
    const result = runScenario({ action: 'deploy', startingState: 'restarting' });
    expect(result.status, result.stderr).toBe(1);
    expect(result.commands).toContain('inspect --format {{.State.Status}}');
    const replacementCommands = result.commands
      .split('\n')
      .filter((line) => line.includes(result.targetDirectory));
    expect(replacementCommands.some((line) => line.includes(' up '))).toBe(false);
    expect(result.current).toBe(result.currentDirectory);
    expect(result.state).toBe('healthy');
  });

  it.each(['up', 'health'] as const)('복구의 %s 검사가 실패하면 성공으로 보고하지 않는다', (failure) => {
    const result = runScenario({ action: 'deploy', failure });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).not.toContain('Previous application images restored.');
    expect(result.current).toBe(result.currentDirectory);
  });
});
