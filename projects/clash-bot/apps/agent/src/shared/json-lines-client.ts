import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

import { pythonEnvironment } from './python.ts';

// 입력을 닫아도 끝나지 않는 워커는 SIGTERM, 그래도 남으면 SIGKILL로 정리한다.
type StopTimings = { terminateAfterMs: number; killAfterMs: number };

const parseLine = (line: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(line);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export class JsonLineClient {
  readonly state = { closed: false, ready: false, pending: 0 };
  readonly queue = { tail: Promise.resolve() as Promise<unknown> };
  startup: Record<string, unknown> = {};
  readonly child: ChildProcessWithoutNullStreams;
  readonly lines: AsyncIterator<string>;
  // 워커가 끝나거나 시작하지 못하면 풀린다. close()는 이 시점까지 기다린다.
  readonly exited: Promise<void>;
  private readonly stopTimings: StopTimings;
  constructor(
    python: string,
    worker: string[],
    model: string,
    extraArgs: string[] = [],
    environment = pythonEnvironment(),
    stopTimings: StopTimings = { terminateAfterMs: 2000, killAfterMs: 7000 },
  ) {
    this.stopTimings = stopTimings;
    this.child = spawn(python, [...worker, model, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...environment,
        HF_HUB_DISABLE_TELEMETRY: '1',
        HF_HUB_OFFLINE: '1',
        USE_TORCH: '0',
        USE_TF: '0',
      },
    });
    this.exited = new Promise((resolve) => {
      this.child.once('exit', () => resolve());
      // 실행 파일을 시작하지 못하면 exit가 오지 않는다.
      this.child.once('error', () => {
        if (this.child.pid === undefined) resolve();
      });
    });
    this.child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    this.child.on('error', () => void this.close());
    this.child.stdin.on('error', () => void this.close());
    this.lines = createInterface({ input: this.child.stdout })[Symbol.asyncIterator]();
  }
  async read(timeoutMs: number): Promise<Record<string, unknown>> {
    const timer = { id: undefined as NodeJS.Timeout | undefined };
    try {
      const line = await Promise.race([
        this.lines.next(),
        new Promise<never>((_, reject) => {
          timer.id = setTimeout(() => {
            void this.close();
            reject(new Error('실행기 응답 제한 시간을 넘겼습니다.'));
          }, timeoutMs);
        }),
      ]);
      if (line.done) throw new Error('작업 실행기가 종료됐습니다.');
      const value = parseLine(line.value);
      if (!value) {
        // 응답이 아닌 줄이 섞이면 이후 응답이 한 칸씩 밀리므로 통신을 닫고 멈춘다.
        void this.close();
        throw new Error('작업 실행기가 JSON 응답이 아닌 줄을 출력해 통신을 닫았습니다.');
      }
      if (value.type === 'error') throw new Error(`Qwen: ${String(value.message)}`);
      return value;
    } finally {
      clearTimeout(timer.id);
    }
  }
  async ready(): Promise<void> {
    if (this.state.ready) return;
    this.startup = await this.read(120_000);
    if (this.startup.type !== 'ready') throw new Error('실행기 시작 응답이 올바르지 않습니다.');
    this.state.ready = true;
  }
  async request(payload: Record<string, unknown>, timeoutMs = 20_000): Promise<Record<string, unknown>> {
    this.state.pending++;
    const result = this.queue.tail.then(async () => {
      if (this.state.closed) throw new Error('작업 실행기가 닫혔습니다.');
      this.child.stdin.write(JSON.stringify(payload) + '\n');
      return this.read(timeoutMs);
    });
    this.queue.tail = result.catch(() => {});
    return result.finally(() => {
      this.state.pending--;
    });
  }
  async infer(
    images: string[],
    prompt: string,
    schema?: unknown,
  ): Promise<{ text: string; elapsedMs: number; peakGb: number }> {
    const response = await this.request({ images, prompt, schema, max_tokens: 160 });
    return {
      text: String(response.text),
      elapsedMs: Number(response.elapsed_ms),
      peakGb: Number(response.peak_gb),
    };
  }
  // 잠금을 풀기 전에 기다려, 이전 워커가 체크포인트를 쓰는 동안 새 실행이 시작되지 않게 한다.
  close(): Promise<void> {
    if (this.state.closed) return this.exited;
    this.state.closed = true;
    this.child.stdin.end();
    if (this.child.exitCode !== null || this.child.signalCode !== null) return this.exited;
    const timers = [
      setTimeout(() => this.child.kill('SIGTERM'), this.stopTimings.terminateAfterMs),
      setTimeout(() => this.child.kill('SIGKILL'), this.stopTimings.killAfterMs),
    ];
    this.child.once('exit', () => timers.forEach((timer) => clearTimeout(timer)));
    return this.exited;
  }
}
