import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from '../../shared/assets.ts';

const line = (row: unknown) => JSON.stringify(row) + '\n';
const pretty = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

// 경기 한 판의 원본 기록 폴더다. Python 학습기(clash_bot.qwen.records.episodes)와 learning/이 같은 파일 이름을 읽는다.
export class MatchRecorder {
  readonly directory: string;
  private constructor(directory: string) {
    this.directory = directory;
  }

  static async create(dataDir: string) {
    const directory = join(dataDir, 'counterpush/runs', new Date().toISOString().replaceAll(':', '-'));
    await mkdir(join(directory, 'frames'), { recursive: true, mode: 0o700 });
    return new MatchRecorder(directory);
  }

  event(row: Record<string, unknown>) {
    return appendFile(join(this.directory, 'events.jsonl'), line({ ...row, at: Date.now() }), {
      mode: 0o600,
    });
  }
  vision(row: Record<string, unknown>) {
    return appendFile(join(this.directory, 'vision.jsonl'), line(row), { mode: 0o600 });
  }
  state(row: Record<string, unknown>) {
    return appendFile(join(this.directory, 'states.jsonl'), line(row), { mode: 0o600 });
  }
  framePath(index: number) {
    return join(this.directory, 'frames', `${String(index).padStart(6, '0')}.png`);
  }
  decisionImagePath(frame: number) {
    return join(this.directory, String(frame).padStart(4, '0') + '.png');
  }
  featurePath(frame: number) {
    return join(this.directory, 'features', String(frame).padStart(4, '0') + '.npz');
  }
  get resultPagePath() {
    return join(this.directory, 'result-page.png');
  }
  observations(file: Record<string, unknown>) {
    return atomicWrite(join(this.directory, 'observations.json'), pretty(file));
  }
  summary(summary: Record<string, unknown>) {
    return atomicWrite(join(this.directory, 'summary.json'), pretty(summary));
  }
}
