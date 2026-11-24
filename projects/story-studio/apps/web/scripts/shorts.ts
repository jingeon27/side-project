import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { trackShortsInvocation } from './shorts-analytics.ts';
import { runBrowser } from './shorts-browser.ts';

const script = fileURLToPath(import.meta.url);
const web = path.resolve(path.dirname(script), '..');
const [command = '--help', ...args] = process.argv.slice(2);
// Workspace scripts use repository-relative arguments. The standalone launcher keeps the shell directory.
const cwd = process.env.PROJECT_CWD || process.cwd();
process.chdir(cwd);

function dataDirectory() {
  if (process.env.STORY_STUDIO_DATA_DIR) return path.resolve(process.env.STORY_STUDIO_DATA_DIR);
  const local = path.join(web, '.data');
  if (existsSync(path.join(local, 'local/.venv/bin/python'))) return local;
  const common = execFileSync('git', ['-C', web, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  return path.join(path.dirname(common), 'projects/story-studio/apps/web/.data');
}

async function main() {
  if (['boards', 'capture', 'leads'].includes(command)) {
    await runBrowser(command, args);
    return 0;
  }
  const data = dataDirectory();
  if (command === 'setup-voice') {
    const setup = spawnSync(process.execPath, [path.join(web, 'scripts/setup-local.ts'), '--shorts-voice'], {
      cwd: web,
      stdio: 'inherit',
      env: { ...process.env, STORY_STUDIO_DATA_DIR: data },
    });
    if (setup.error) throw setup.error;
    return setup.status ?? 1;
  }
  const python = path.join(data, 'local/.venv/bin/python');
  const executable = existsSync(python) ? python : process.env.PYTHON || 'python3.11';
  const result = spawnSync(executable, ['-m', 'story_studio.shorts', command, ...args], {
    env: {
      ...process.env,
      PYTHONPATH: path.resolve(web, '../engine/src'),
      STORY_STUDIO_DATA_DIR: data,
      SHORTS_NODE: process.execPath,
      SHORTS_SCRIPT: script,
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

try {
  const action =
    command === 'youtube' &&
    !args.some((arg) => ['--help', '-h'].includes(arg)) &&
    !(args[0] === 'upload' && args.includes('--auto'))
      ? `youtube-${args[0]}`
      : command;
  process.exitCode = await trackShortsInvocation(action, main);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
