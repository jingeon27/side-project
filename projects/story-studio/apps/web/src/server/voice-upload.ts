import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { voiceIdSchema, voiceSampleInputSchema, voiceSampleSchema } from '../lib/voice-training';
import { dataPath } from './assets';
import { readBody, StudioError } from './errors';
import { runLocal } from './local-worker';
import {
  assertVoiceEditable,
  getVoiceSamples,
  voicePath,
  withVoiceMutation,
  writeVoiceDocument,
} from './voice-store';

function audioFormat(bytes: Buffer) {
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (bytes.toString('ascii', 0, 4) === 'fLaC') return 'flac';
  if (bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'mov';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'matroska';
  if (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] || 0) & 0xe0) === 0xe0))
    return 'mp3';
  throw new StudioError(
    '지원하는 음성 파일을 선택해 주세요. WAV, MP3, M4A, FLAC, OGG와 WebM을 지원합니다.',
    400,
  );
}
export async function uploadVoiceSample(request: Request, voiceId: string, sampleId: string) {
  return withVoiceMutation(voiceId, () => upload(request, voiceId, sampleId));
}
async function upload(request: Request, voiceId: string, sampleId: string) {
  if (!voiceIdSchema.safeParse(sampleId).success) throw new StudioError('올바른 녹음 ID가 아닙니다.', 400);
  await assertVoiceEditable(voiceId);
  const samples = await getVoiceSamples(voiceId);
  const existing = samples.find((sample) => sample.id === sampleId);
  if (!existing && samples.length >= 50)
    throw new StudioError('한 목소리에 녹음을 최대 50개까지 저장합니다.', 409);
  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('multipart/form-data;'))
    throw new StudioError('음성 파일 업로드 형식이 필요합니다.', 415);
  const body = await readBody(request, 10_100_000);
  const form = await new Response(body, { headers: { 'Content-Type': type } }).formData().catch(() => {
    throw new StudioError('음성 업로드 내용을 읽지 못했습니다.', 400);
  });
  const file = form.get('file');
  const input = voiceSampleInputSchema.safeParse({ transcript: form.get('transcript') });
  if (!(file instanceof File) || !file.size || file.size > 10_000_000 || !input.success)
    throw new StudioError('10MB 이하 음성 파일과 실제로 읽은 대본을 입력해 주세요.', 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const format = audioFormat(bytes);
  const contentHash = createHash('sha256').update(bytes).digest('hex');
  if (existing?.contentHash === contentHash && existing.transcript === input.data.transcript) return existing;
  const uploadId = randomUUID();
  const folder = dataPath('voice-uploads', uploadId);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'source'), bytes, { flag: 'wx', mode: 0o600 });
  try {
    const normalized = z
      .object({
        asset: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.wav$/),
        duration: z.number().min(1).max(30),
      })
      .parse(await runLocal({ action: 'normalize-voice', uploadId, format }, request.signal));
    const sample = await (async () => {
      try {
        await assertVoiceEditable(voiceId);
        const audioHash = createHash('sha256')
          .update(await readFile(dataPath('assets', path.basename(normalized.asset))))
          .digest('hex');
        const value = voiceSampleSchema.parse({
          id: sampleId,
          filename: file.name.replace(/[\x00-\x1f]/g, '').slice(0, 160),
          transcript: input.data.transcript,
          ...normalized,
          contentHash,
          audioHash,
        });
        await writeVoiceDocument(voicePath(voiceId, 'samples', `${sampleId}.json`), value);
        return value;
      } catch (error) {
        await rm(dataPath('assets', path.basename(normalized.asset)), { force: true }).catch(() => undefined);
        throw error;
      }
    })();
    if (existing && existing.asset !== sample.asset)
      await rm(dataPath('assets', path.basename(existing.asset)), { force: true }).catch(() =>
        console.error('교체한 녹음의 이전 자산을 정리하지 못했습니다.'),
      );
    return sample;
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() =>
      console.error('음성 업로드 임시 폴더를 정리하지 못했습니다.'),
    );
  }
}
