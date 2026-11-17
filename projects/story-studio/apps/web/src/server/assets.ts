import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { z } from 'zod';

import { taskSchema, type TVideoTask } from '../lib/story';
import { StudioError } from './errors';

export function dataPath(...parts: string[]) {
  // Runtime user files must never be traced into a build artifact.
  return path.join(
    /* turbopackIgnore: true */ process.env.STORY_STUDIO_DATA_DIR || path.join(process.cwd(), '.data'),
    ...parts,
  );
}
export function examplePath(...parts: string[]) {
  return path.join(process.cwd(), 'public', 'examples', ...parts);
}
export function trustedAssetUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.aliyuncs.com') ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new StudioError('생성 서버가 지원하지 않는 파일 주소를 반환했습니다.');
  }
  return url;
}
export async function saveAsset(url: string, extension: 'png' | 'mp4') {
  const response = await fetch(trustedAssetUrl(url), {
    redirect: 'error',
    signal: AbortSignal.timeout(180_000),
  });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !response.body || !type.startsWith(extension === 'png' ? 'image/' : 'video/')) {
    throw new StudioError('생성한 파일을 저장하지 못했습니다. 다시 상태를 확인해 주세요.');
  }
  const filename = `${randomUUID()}.${extension}`;
  await mkdir(dataPath('assets'), { recursive: true });
  const destination = dataPath('assets', filename);
  const partial = `${destination}.partial`;
  const total = { bytes: 0 };
  const limit = extension === 'png' ? 25_000_000 : 250_000_000;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total.bytes += chunk.byteLength;
      callback(
        total.bytes > limit ? new StudioError('생성한 파일이 저장 가능한 크기를 초과했습니다.') : null,
        chunk,
      );
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      limiter,
      createWriteStream(partial, { flags: 'wx' }),
    );
    await rename(partial, destination);
    return `/api/assets/${filename}`;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// A scene image made outside the studio. The browser has already converted it to a PNG in the project ratio.
export async function saveImage(bytes: Buffer) {
  if (bytes.byteLength < 100 || !bytes.subarray(0, 8).equals(pngSignature))
    throw new StudioError('PNG 이미지만 저장할 수 있습니다.', 400);
  const filename = `${randomUUID()}.png`;
  await mkdir(dataPath('assets'), { recursive: true });
  const destination = dataPath('assets', filename);
  const partial = `${destination}.partial`;
  try {
    await writeFile(partial, bytes, { flag: 'wx', mode: 0o600 });
    await rename(partial, destination);
    return `/api/assets/${filename}`;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
export async function storeTask(task: TVideoTask) {
  await mkdir(dataPath('tasks'), { recursive: true });
  const filename = dataPath('tasks', `${task.id}.json`);
  const temporary = `${filename}.${randomUUID()}.partial`;
  await writeFile(temporary, JSON.stringify(task), { flag: 'wx', mode: 0o600 });
  await rename(temporary, filename);
}
export async function readTask(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new StudioError('올바른 영상 작업이 아닙니다.', 400);
  try {
    const stored = taskSchema
      .extend({ ownerPid: z.number().int().min(2).optional() })
      .parse(JSON.parse(await readFile(dataPath('tasks', `${id}.json`), 'utf8')));
    const task = taskSchema.parse(stored);
    if (id.startsWith('local-') && stored.ownerPid && ['PENDING', 'RUNNING'].includes(task.status)) {
      try {
        process.kill(stored.ownerPid, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        const failed = {
          id,
          status: 'FAILED' as const,
          error: '로컬 생성 프로세스가 종료되었습니다. 원고는 보존됐으며 다시 생성할 수 있습니다.',
        };
        await storeTask(failed);
        return failed;
      }
    }
    return task;
  } catch {
    throw new StudioError('이 스튜디오에서 시작한 영상 작업을 찾을 수 없습니다.', 404);
  }
}
export async function assetResponse(filename: string, range: string | null) {
  if (!/^[a-f0-9-]{36}\.(png|mp4|wav)$/.test(filename))
    throw new StudioError('파일을 찾을 수 없습니다.', 404);
  const filepath = await stat(dataPath('assets', filename))
    .then(() => dataPath('assets', filename))
    .catch(() => examplePath(filename));
  const file = await stat(filepath).catch(() => {
    throw new StudioError('파일을 찾을 수 없습니다. 원본 스튜디오의 저장 폴더를 확인해 주세요.', 404);
  });
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  const start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, file.size - Number(match[2])) : 0;
  const end = match?.[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
  if (range && (!match || start > end || start >= file.size || (match[1] === '' && match[2] === ''))) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
  }
  return new Response(Readable.toWeb(createReadStream(filepath, { start, end })) as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': filename.endsWith('.mp4')
        ? 'video/mp4'
        : filename.endsWith('.wav')
          ? 'audio/wav'
          : 'image/png',
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${file.size}` } : {}),
    },
  });
}
