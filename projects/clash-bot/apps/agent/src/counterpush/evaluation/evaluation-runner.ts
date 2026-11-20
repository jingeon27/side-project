import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';

import type { Profile } from '../../core/profile.ts';
import { LearningClient } from '../../qwen/learning-client.ts';
import { MODEL } from '../../qwen/model.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { readJsonFile } from '../../shared/json-file.ts';
import { acquireLearningLock, stopRequested } from '../../shared/runtime-lock.ts';
import { CounterpushBrowser } from '../browser/browser.ts';
import { CounterpushVisionClient } from '../perception/vision-client.ts';
import { behaviorIdentity } from './behavior-identity.ts';
import { candidateMetadataSchema, evaluateWithResources } from './evaluation-trial.ts';

export async function runCounterpushEvaluation(options: {
  dataDir: string;
  profile: Profile;
  candidate: string;
  pairs: number;
  hours: number;
  signal: AbortSignal;
}) {
  const { dataDir, signal } = options;
  const behaviorSHA256 = await behaviorIdentity(options.profile);
  await readJsonFile(join(options.candidate, 'metadata.json'), candidateMetadataSchema);
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const client = new LearningClient(dataDir),
    vision = new CounterpushVisionClient(dataDir);
  const resources: { browser: CounterpushBrowser | null } = { browser: null };
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: dayjs().toISOString(),
    phase: 'evaluation_loading',
    behaviorSHA256,
    model: MODEL.name,
    completed: 0,
    updates: 0,
    candidate: options.candidate,
  };
  const report = async (update: Record<string, unknown>) => {
    Object.assign(status, update, { updatedAt: dayjs().toISOString() });
    await atomicWrite(join(control, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  };
  const abort = () => {
    void client.close();
    void vision.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'evaluation_loading' });
    await client.ready();
    await vision.ready();
    const browser = await CounterpushBrowser.open(dataDir);
    resources.browser = browser;
    const deadline = options.hours ? dayjs().valueOf() + options.hours * 3_600_000 : Infinity;
    const result = await evaluateWithResources({
      ...options,
      behaviorSHA256,
      client,
      vision,
      browser,
      file: join(control, 'evaluations', `${status.startedAt.replaceAll(':', '-')}-${randomUUID()}.json`),
      report,
      stopped: async () => {
        if (signal.aborted || dayjs().valueOf() >= deadline) return true;
        return stopRequested(join(dataDir, 'qwen/selfplay'), lock.owner.id);
      },
    });
    await report({
      phase: 'stopped',
      evaluationFile: result.reportPath,
      gate: result.gate,
      baselineUnchanged: result.baselineUnchanged,
    });
    return result;
  } catch (error) {
    await resources.browser?.screenshot(join(control, 'last-evaluation-error.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await Promise.all([client.close(), vision.close()]);
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
