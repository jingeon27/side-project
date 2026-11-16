import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export class QwenClient {
  readonly state = { closed: false, ready: false, pending: 0 };
  readonly queue = { tail: Promise.resolve() as Promise<unknown> };
  startup: Record<string, unknown> = {};
  readonly child: ChildProcessWithoutNullStreams;
  readonly lines: AsyncIterator<string>;
  constructor(python: string, worker: string, model: string, extraArgs: string[] = []) {
    this.child = spawn(python, [worker, model, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HF_HUB_DISABLE_TELEMETRY: '1',
        HF_HUB_OFFLINE: '1',
        USE_TORCH: '0',
        USE_TF: '0',
      },
    });
    this.child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    this.child.on('error', () => this.close());
    this.child.stdin.on('error', () => this.close());
    this.lines = createInterface({ input: this.child.stdout })[Symbol.asyncIterator]();
  }
  async read(timeoutMs: number): Promise<Record<string, unknown>> {
    const timer = { id: undefined as NodeJS.Timeout | undefined };
    try {
      const line = await Promise.race([
        this.lines.next(),
        new Promise<never>((_, reject) => {
          timer.id = setTimeout(() => {
            this.close();
            reject(new Error('Qwen 응답 제한 시간을 넘겼습니다.'));
          }, timeoutMs);
        }),
      ]);
      if (line.done) throw new Error('Qwen 실행기가 종료됐습니다.');
      const value = JSON.parse(line.value) as Record<string, unknown>;
      if (value.type === 'error') throw new Error(`Qwen: ${String(value.message)}`);
      return value;
    } finally {
      clearTimeout(timer.id);
    }
  }
  async ready(): Promise<void> {
    if (this.state.ready) return;
    this.startup = await this.read(120_000);
    if (this.startup.type !== 'ready') throw new Error('Qwen 시작 응답이 올바르지 않습니다.');
    this.state.ready = true;
  }
  async request(payload: Record<string, unknown>, timeoutMs = 20_000): Promise<Record<string, unknown>> {
    this.state.pending++;
    const result = this.queue.tail.then(async () => {
      if (this.state.closed) throw new Error('Qwen 실행기가 닫혔습니다.');
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
  close(): void {
    if (this.state.closed) return;
    this.state.closed = true;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill('SIGTERM'), 2000);
    timer.unref();
    this.child.once('exit', () => clearTimeout(timer));
  }
}
