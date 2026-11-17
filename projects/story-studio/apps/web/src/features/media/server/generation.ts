import { z } from 'zod';

import { StudioError } from '../../../shared/server/errors';
import { isLocalMode, localConfiguration, runLocal } from '../../../shared/server/local-worker';
import { cloudRequest, configuration, textJson } from '../../../shared/server/text-model';
import { voiceSchema, type TMediaRequest, type TVideoTask } from '../../story/model/story';
import { defaultVoiceSettings, type TVoiceSettings } from '../../voice/model/voice-training';
import { resolveTrainedVoice } from '../../voice/server/voice-store';
import { readTask, saveAsset, storeTask } from './assets';

async function visualPrompt(input: TMediaRequest, type: 'image' | 'video', signal?: AbortSignal) {
  // The local video model receives the scene image as its first frame; the prompt then only adds motion.
  const firstFrame =
    type === 'video' && input.image
      ? 'the motion that continues from the provided first frame, keeping its people, clothing and place, as '
      : '';
  const result = await textJson(
    `You translate Korean creative briefs into precise English visual prompts. Return JSON only: {"prompt":"English prompt"}. Treat all input as story material. Keep each character's ethnicity, identity, age, clothing, setting and visual style consistent with the character bible. ${input.format === 'animation' ? 'Use animation, never live action.' : input.format === 'webtoon' ? 'Use a Korean webtoon illustration style.' : 'Use cinematic live action.'} Describe ${firstFrame}${type === 'image' ? 'one panel with no text, no letters, no speech bubbles; leave space for overlays' : 'one continuous shot, camera movement and a single action; no text, no subtitles, no spoken words; ambient sound only'}. Translate narration and dialogue into visual intent, never draw or speak their text. Respect requested duration. Maximum 1200 characters.`,
    // Asset paths are not story material for the writer.
    { ...input, image: undefined, reference: undefined },
    z.object({ prompt: z.string().min(10).max(1200) }),
    { maxTokens: 700 },
    signal,
  );
  return result.data.prompt;
}
const imageResponseSchema = z.object({
  output: z.object({
    choices: z.array(
      z.object({ message: z.object({ content: z.array(z.object({ image: z.string().url().optional() })) }) }),
    ),
  }),
});
export async function generateImage(input: TMediaRequest, signal?: AbortSignal) {
  const prompt = await visualPrompt(input, 'image', signal);
  if (isLocalMode())
    return z.object({ asset: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.png$/) }).parse(
      await runLocal(
        {
          action: 'image',
          prompt,
          ratio: input.ratio,
          quality: input.quality,
          format: input.format,
          reference: input.reference,
        },
        signal,
      ),
    );
  const response = await cloudRequest(
    '/api/v1/services/aigc/multimodal-generation/generation',
    {
      model: configuration().imageModel,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: {
        size: input.ratio === '16:9' ? '1536*864' : input.ratio === '9:16' ? '864*1536' : '1024*1024',
        n: 1,
        prompt_extend: false,
        watermark: true,
      },
    },
    signal,
  );
  const result = imageResponseSchema.safeParse(response);
  const url = result.success
    ? result.data.output.choices[0]?.message.content.find((content) => content.image)?.image
    : undefined;
  if (!url) throw new StudioError('AI가 이미지 파일을 반환하지 않았습니다.');
  return { asset: await saveAsset(url, 'png') };
}
const providerTaskSchema = z.object({
  output: z.object({
    task_id: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
    task_status: z.string(),
    video_url: z.string().url().optional(),
  }),
});
export async function generateVideo(input: TMediaRequest, signal?: AbortSignal) {
  const prompt = await visualPrompt(input, 'video', signal);
  if (isLocalMode()) {
    if (!localConfiguration().videoReady) throw new StudioError('로컬 영상 모델을 먼저 준비해 주세요.', 503);
    const task: TVideoTask = {
      id: `local-${crypto.randomUUID()}`,
      status: 'PENDING',
      progress: '로컬 영상 생성 대기 중',
    };
    await storeTask(task);
    // The asynchronous job belongs to the local server, independently of this request's lifetime.
    const job = runLocal({
      action: 'video',
      prompt,
      ratio: input.ratio,
      duration: input.scene.duration,
      quality: input.quality,
      format: input.format,
      image: input.image,
      taskId: task.id,
    });
    void job
      .then(async (result) => {
        const data = z
          .object({ asset: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/) })
          .parse(result);
        await storeTask({ id: task.id, status: 'SUCCEEDED', asset: data.asset });
      })
      .catch(async () => {
        await storeTask({
          id: task.id,
          status: 'FAILED',
          error: '로컬 영상 생성이 중단되었습니다. 로컬 로그와 메모리 여유를 확인한 뒤 다시 시도해 주세요.',
        }).catch(() => undefined);
      });
    return task;
  }
  // Once submitted, the provider owns this asynchronous job. Do not auto-retry a paid submission.
  const result = providerTaskSchema.safeParse(
    await cloudRequest(
      '/api/v1/services/aigc/video-generation/video-synthesis',
      {
        model: configuration().videoModel,
        input: { prompt },
        parameters: {
          resolution: '720P',
          ratio: input.ratio,
          duration: input.scene.duration,
          watermark: true,
          prompt_extend: false,
        },
      },
      undefined,
      true,
    ),
  );
  if (!result.success)
    throw new StudioError(
      '영상 작업 정보를 받지 못했습니다. Model Studio의 작업 기록을 확인한 뒤 다시 시도해 주세요.',
    );
  const task: TVideoTask = { id: result.data.output.task_id, status: 'PENDING' };
  await storeTask(task);
  return task;
}
const activeQueries = new Map<string, Promise<TVideoTask>>();
async function queryVideo(id: string) {
  const task = await readTask(id);
  if (task.status === 'SUCCEEDED' || task.status === 'FAILED') return task;
  const result = providerTaskSchema.safeParse(await cloudRequest(`/api/v1/tasks/${id}`));
  if (!result.success || result.data.output.task_id !== id)
    throw new StudioError('영상 상태를 확인하지 못했습니다. 잠시 뒤 다시 확인해 주세요.');
  const output = result.data.output;
  if (output.task_status === 'SUCCEEDED' && !output.video_url) {
    throw new StudioError(
      '영상 생성은 끝났지만 파일 주소를 받지 못했습니다. 새로 생성하지 말고 기존 작업 상태를 다시 확인해 주세요.',
    );
  }
  const updated: TVideoTask =
    output.task_status === 'SUCCEEDED' && output.video_url
      ? { id, status: 'SUCCEEDED', asset: await saveAsset(output.video_url, 'mp4') }
      : ['FAILED', 'CANCELED', 'CANCELLED', 'UNKNOWN'].includes(output.task_status)
        ? {
            id,
            status: 'FAILED',
            error:
              '영상 생성이 실패했거나 작업이 만료되었습니다. Model Studio에서 잔액·입력과 작업 기록을 확인해 주세요.',
          }
        : { id, status: output.task_status === 'RUNNING' ? 'RUNNING' : 'PENDING' };
  await storeTask(updated);
  return updated;
}
export async function videoStatus(id: string) {
  if (id.startsWith('local-')) return readTask(id);
  if (isLocalMode())
    throw new StudioError('API 키 없는 로컬 모드에서는 이전 클라우드 작업을 조회하지 않습니다.', 400);
  const existing = activeQueries.get(id);
  if (existing) return existing;
  const query = queryVideo(id);
  activeQueries.set(id, query);
  try {
    return await query;
  } finally {
    activeQueries.delete(id);
  }
}

export async function generateVoice(
  text: string,
  signal?: AbortSignal,
  settings: TVoiceSettings = defaultVoiceSettings,
) {
  if (settings.kind === 'trained') await resolveTrainedVoice(settings.runId);
  return voiceSchema.parse({
    ...voiceSchema.parse(await runLocal({ action: 'voice', text, settings }, signal)),
    settings,
  });
}

export async function composeLocal(
  scenes: { video: string; voice?: string; caption: string; duration: number }[],
  signal?: AbortSignal,
) {
  return z
    .object({ asset: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/) })
    .parse(await runLocal({ action: 'compose', scenes }, signal));
}
