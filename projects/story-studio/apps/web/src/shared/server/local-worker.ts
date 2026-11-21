import { execFile, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { promisify } from 'node:util';

import { match } from 'ts-pattern';

import { dataPath, examplePath, readTask, storeTask } from '../../features/media/server/assets';
import { StudioError } from './errors';

const localRuntime = globalThis as typeof globalThis & { storyStudioJobs?: Set<string> };
const activeJobs = localRuntime.storyStudioJobs ?? new Set<string>();
localRuntime.storyStudioJobs = activeJobs;
export function localWorkerBusy() {
  if (activeJobs.size) return true;
  try {
    const active = JSON.parse(readFileSync(dataPath('local', 'active.json'), 'utf8')) as { pid: number };
    if (!Number.isInteger(active.pid) || active.pid < 1) return false;
    process.kill(active.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function cancelLocalVideo(id: string) {
  if (!/^local-[a-f0-9-]{36}$/.test(id)) throw new StudioError('로컬 영상 작업만 중단할 수 있습니다.', 400);
  const task = await readTask(id);
  if (task.status === 'SUCCEEDED' || task.status === 'FAILED') return task;
  await stopLocalWorker(id);
  const cancelled = {
    id,
    status: 'FAILED' as const,
    error: '사용자가 영상 생성을 중단했습니다. 원고는 보존됩니다.',
  };
  await storeTask(cancelled);
  return cancelled;
}
export async function stopLocalWorker(id: string) {
  const active = (() => {
    try {
      return JSON.parse(readFileSync(dataPath('local', 'active.json'), 'utf8')) as {
        pid?: number;
        taskId?: string;
      };
    } catch {
      throw new StudioError('작업을 시작하거나 종료하는 중입니다. 잠시 뒤 상태를 확인해 주세요.', 409);
    }
  })();
  if (!active.pid || !Number.isInteger(active.pid) || active.pid < 2 || active.taskId !== id)
    throw new StudioError('작업을 시작하는 중입니다. 잠시 뒤 다시 중단해 주세요.', 409);
  const running = await promisify(execFile)('/bin/ps', ['-p', String(active.pid), '-o', 'command=']);
  // Verify the PID still belongs to this exact studio worker before signalling it.
  if (
    !running.stdout.includes(
      `-m story_studio --data-dir ${dataPath()} --examples-dir ${path.join(process.cwd(), 'public/examples')}`,
    )
  )
    throw new StudioError('현재 스튜디오의 실행 작업을 확인하지 못했습니다.', 409);
  process.kill(active.pid, 'SIGTERM');
  // A terminal status can be saved just before MLX releases the process and GPU.
  // Do not return a resumable state until the worker is actually gone.
  const deadline = performance.now() + 10_000;
  do {
    await pause(100);
    try {
      process.kill(active.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
      throw error;
    }
  } while (performance.now() < deadline);
  throw new StudioError('중단을 요청했습니다. 모델 계산이 정리되면 다시 실행할 수 있습니다.', 409);
}

export function isLocalMode() {
  return process.env.STORY_STUDIO_PROVIDER !== 'cloud';
}
function writerModelReady() {
  const directory = dataPath('local', 'models', 'text-gemma-4-31b-it-4bit');
  try {
    // The Hub publishes each completed file separately. The index can arrive before the weights.
    const index = JSON.parse(readFileSync(path.join(directory, 'model.safetensors.index.json'), 'utf8')) as {
      weight_map: Record<string, unknown>;
    };
    const shards = [...new Set(Object.values(index.weight_map))];
    const hasFile = (name: string) => {
      const file = statSync(path.join(directory, name), { throwIfNoEntry: false });
      return file?.isFile() === true && file.size > 0;
    };
    return (
      shards.length > 0 &&
      shards.every(
        (name) => typeof name === 'string' && /^model-\d+-of-\d+\.safetensors$/.test(name) && hasFile(name),
      ) &&
      [
        'config.json',
        'tokenizer.json',
        'tokenizer_config.json',
        'processor_config.json',
        'chat_template.jinja',
      ].every(hasFile)
    );
  } catch {
    return false;
  }
}
export function localConfiguration() {
  const runtime = existsSync(dataPath('local', '.venv', 'bin', 'python'));
  const textReady = runtime && writerModelReady();
  const materialReady =
    runtime && existsSync(dataPath('local', 'models', 'embedding-gemma-2-8bit', 'model.safetensors'));
  const voiceReady = runtime && existsSync(dataPath('local', 'models', 'voice', 'model.safetensors'));
  const voiceTrainingReady =
    runtime && existsSync(dataPath('local', 'models', 'voice-train', 'model.safetensors'));
  // Setup writes ready.json after saving or converting the weights the engine loads, then removes the download.
  // An earlier Wan2.1 install in `models/video` is therefore not ready.
  const imageReady =
    runtime && existsSync(dataPath('local', 'models', 'image-flux2-klein-4b-q8', 'ready.json'));
  const videoReady = runtime && existsSync(dataPath('local', 'models', 'video-wan2.2-ti2v-5b', 'ready.json'));
  return {
    provider: 'local' as const,
    configured: textReady,
    textReady,
    voiceReady,
    voiceTrainingReady,
    videoReady,
    imageReady,
    materialReady,
    demoReady: existsSync(dataPath('demo-project.json')) || existsSync(examplePath('project.json')),
    textModel: 'Gemma 4 31B, 4bit',
    materialModel: 'EmbeddingGemma 2',
    imageModel: 'FLUX.2 Klein 4B',
    videoModel: 'Wan2.2 TI2V 5B',
    voiceModel: 'Qwen3-TTS 기본 음색 9종',
  };
}

type TWorkerEvents = { onProgress?: (message: string) => void; onReply?: (reply: unknown) => void };
// Starts one engine process. `done` settles with the engine's final result when the process ends.
async function startWorker(
  input: Record<string, unknown>,
  signal: AbortSignal | undefined,
  events: TWorkerEvents,
) {
  const config = localConfiguration();
  const settings = input.settings as { kind?: string } | undefined;
  const ready = match(input.action)
    .with('compose', 'normalize-voice', 'delete-material', () =>
      existsSync(dataPath('local', '.venv', 'bin', 'python')),
    )
    .with('text', 'text-session', () => config.textReady)
    .with('voice', () => (settings?.kind === 'trained' ? config.voiceTrainingReady : config.voiceReady))
    .with('train-voice', () => config.voiceTrainingReady)
    .with('image', () => config.imageReady)
    .with('video', () => config.videoReady)
    .with('sync-material', () => config.materialReady)
    .otherwise(() => false);
  if (!ready)
    throw new StudioError('로컬 모델 준비가 필요합니다. 연결 안내의 로컬 설치 방법을 확인해 주세요.', 503);
  signal?.throwIfAborted();
  const usesModel = !['compose', 'normalize-voice', 'delete-material'].includes(String(input.action));
  if (usesModel && localWorkerBusy())
    throw new StudioError(
      '다른 로컬 생성 작업이 실행 중입니다. 현재 작업이 끝난 뒤 다시 시도해 주세요.',
      409,
    );
  const python = dataPath('local', '.venv', 'bin', 'python');
  const logId = crypto.randomUUID();
  if (usesModel) activeJobs.add(logId);
  try {
    await mkdir(dataPath('local', 'logs'), { recursive: true });
    const descriptor = openSync(dataPath('local', 'logs', `${logId}.log`), 'w', 0o600);
    const child = spawn(
      python,
      [
        '-m',
        'story_studio',
        '--data-dir',
        dataPath(),
        '--examples-dir',
        path.join(process.cwd(), 'public/examples'),
      ],
      {
        shell: false,
        stdio: ['pipe', 'pipe', descriptor],
        detached: typeof input.taskId === 'string',
        env: {
          PATH: process.env.PATH,
          NODE_ENV: process.env.NODE_ENV || 'production',
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          LANG: 'ko_KR.UTF-8',
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
          HF_HUB_DISABLE_TELEMETRY: '1',
          DO_NOT_TRACK: '1',
          PYTHONUNBUFFERED: '1',
          PYTHONPATH: path.resolve(process.cwd(), '../engine/src'),
          OMP_NUM_THREADS: '2',
          VECLIB_MAXIMUM_THREADS: '2',
          OPENBLAS_NUM_THREADS: '2',
          NUMBA_NUM_THREADS: '2',
        },
      },
    );
    closeSync(descriptor);
    if (!child.stdout || !child.stdin) {
      child.kill('SIGTERM');
      throw new StudioError('로컬 모델 입출력을 열지 못했습니다.');
    }
    const stdout = child.stdout;
    const stdin = child.stdin;
    const abort = () => {
      child.kill('SIGTERM');
    };
    const done = new Promise<unknown>((resolve, reject) => {
      const output = { buffer: '', result: undefined as unknown, error: '' };
      signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => {
        output.error = '로컬 생성 시간이 60분을 초과했습니다. 분량을 줄여 다시 시도해 주세요.';
        child.kill('SIGTERM');
      }, 60 * 60_000);
      stdout.on('data', (chunk) => {
        output.buffer += String(chunk);
        const lines = output.buffer.split('\n');
        output.buffer = lines.pop() || '';
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (typeof event.progress === 'string') events.onProgress?.(event.progress);
            if ('reply' in event) events.onReply?.(event.reply);
            if ('result' in event) output.result = event.result;
            if (typeof event.error === 'string') output.error = event.error;
          } catch {
            /* Model diagnostics belong to stderr, never to the result contract. */
          }
        }
      });
      child.once('error', () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        reject(new StudioError('로컬 Python 실행 환경을 열지 못했습니다.', 503));
      });
      stdin.on('error', () => undefined);
      child.once('close', (code) => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        if (signal?.aborted) {
          reject(new DOMException('중단했습니다.', 'AbortError'));
          return;
        }
        if (code === 0 && output.result !== undefined) {
          resolve(output.result);
          return;
        }
        reject(
          new StudioError(
            output.error || `로컬 모델 실행에 실패했습니다. 로컬 로그 ${logId}를 확인해 주세요.`,
          ),
        );
      });
    }).finally(() => activeJobs.delete(logId));
    return { stdin, done, abort };
  } catch (error) {
    activeJobs.delete(logId);
    throw error;
  }
}

export async function runLocal(
  input: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<unknown> {
  const worker = await startWorker(input, signal, { onProgress });
  worker.stdin.end(JSON.stringify(input));
  if (signal?.aborted) worker.abort();
  return worker.done;
}

export type TLocalSession = {
  send: (request: Record<string, unknown>) => Promise<unknown>;
  close: () => Promise<void>;
};
// A writing session keeps the writer model loaded: every `send` is answered by the same engine process.
// A story is a plan and one request per scene, and loading the model for each would cost more than writing.
export async function openLocalSession(
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<TLocalSession> {
  const waiting: PromiseWithResolvers<unknown>[] = [];
  const worker = await startWorker({ action: 'text-session' }, signal, {
    onProgress,
    onReply: (reply) => waiting.shift()?.resolve(reply),
  });
  worker.stdin.write(`${JSON.stringify({ action: 'text-session' })}\n`);
  // Once the process ends, whatever is still waiting for an answer fails with the reason it ended.
  const ended = worker.done.then(
    () => new StudioError('로컬 모델이 답하지 않고 종료되었습니다. 로컬 로그를 확인해 주세요.'),
    (error: unknown) => error,
  );
  void ended.then((reason) => {
    for (const pending of waiting.splice(0)) pending.reject(reason);
  });
  if (signal?.aborted) worker.abort();
  return {
    send(request) {
      const pending = Promise.withResolvers<unknown>();
      waiting.push(pending);
      worker.stdin.write(`${JSON.stringify(request)}\n`);
      return pending.promise;
    },
    async close() {
      worker.stdin.end();
      await ended;
    },
  };
}
