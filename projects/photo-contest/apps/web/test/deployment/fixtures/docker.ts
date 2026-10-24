import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

interface IState {
  active: string;
  migrated: string[];
}
const stateFile = process.env.DEPLOY_FAKE_STATE ?? '';
if (!stateFile) throw new Error('격리한 CLI 상태 파일이 필요합니다.');
const state: IState = JSON.parse(readFileSync(stateFile, 'utf8'));
const args = process.argv.slice(2);
const phase = process.env.DEPLOY_FAKE_FAILURE;
const broken = process.env.DEPLOY_FAKE_BROKEN;

function main() {
  if (process.env.DEPLOY_FAKE_TOOL === 'sleep') return;
  if (process.env.DEPLOY_FAKE_TOOL === 'curl') {
    if (phase === 'health' && state.active === broken) process.exit(1);
    process.stdout.write('{"status":"ok"}');
    return;
  }
  const fileIndex = args.indexOf('-f');
  const composeFile = args[fileIndex + 1];
  if (!composeFile) throw new Error('Compose 파일이 필요합니다.');
  const revision = basename(dirname(composeFile));
  if (args.includes('config')) return;
  if (args.includes('pull')) {
    if (phase === 'pull') process.exit(1);
    return;
  }
  if (args.includes('exec')) {
    if (phase === 'backup') process.exit(1);
    process.stdout.write('PGDMP: isolated backup fixture');
    return;
  }
  if (args.includes('run') && args.includes('migrate')) {
    if (phase === 'migrate') process.exit(1);
    state.migrated.push(revision);
    writeFileSync(stateFile, JSON.stringify(state));
    return;
  }
  if (args.includes('up')) {
    if (!args.includes('api')) return;
    state.active = revision;
    writeFileSync(stateFile, JSON.stringify(state));
    if (phase === 'activate' && revision === broken) process.exit(1);
    return;
  }
  throw new Error('지원하지 않는 Docker 경계 명령입니다.');
}

main();
