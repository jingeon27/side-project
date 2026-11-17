import { match } from 'ts-pattern';
import { z } from 'zod';

import {
  composeLocal,
  generateImage,
  generateVideo,
  generateVoice,
} from '../../../features/media/server/generation';
import { briefSchema, mediaRequestSchema, voiceRequestSchema } from '../../../features/story/model/story';
import { continueStory, startStory } from '../../../features/story/server/writing';
import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../shared/server/errors';
import { configuration } from '../../../shared/server/text-model';

export const runtime = 'nodejs';
export const maxDuration = 300;
const actionSchema = z.discriminatedUnion('action', [
  // Both start a writing job on the server and answer with its status; the scenes arrive in the work itself.
  z.object({ action: z.literal('write'), input: briefSchema }),
  z.object({ action: z.literal('continue'), input: z.object({ projectId: z.string().uuid() }) }),
  z.object({ action: z.literal('image'), input: mediaRequestSchema }),
  z.object({ action: z.literal('video'), input: mediaRequestSchema }),
  z.object({ action: z.literal('voice'), input: voiceRequestSchema }),
  z.object({
    action: z.literal('compose'),
    input: z.object({
      scenes: z
        .array(
          z.object({
            video: z.string().regex(/^\/api\/assets\/[a-f0-9-]{36}\.mp4$/),
            voice: z
              .string()
              .regex(/^\/api\/assets\/[a-f0-9-]{36}\.wav$/)
              .optional(),
            caption: z.string().max(12000),
            duration: z.number().min(2).max(15),
          }),
        )
        .min(1)
        .max(80),
    }),
  }),
]);
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    return Response.json(configuration(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const result = actionSchema.safeParse(await readJson(request));
    if (!result.success)
      throw new StudioError('입력 형식이나 분량을 확인해 주세요. 원고는 최대 80개 장면까지 지원합니다.', 400);
    const data = await match(result.data)
      .with({ action: 'write' }, (action) => startStory(action.input))
      .with({ action: 'continue' }, (action) => continueStory(action.input.projectId))
      .with({ action: 'voice' }, (action) =>
        generateVoice(action.input.text, request.signal, action.input.settings),
      )
      .with({ action: 'compose' }, (action) => composeLocal(action.input.scenes, request.signal))
      .with({ action: 'image' }, (action) => generateImage(action.input, request.signal))
      .with({ action: 'video' }, (action) => generateVideo(action.input, request.signal))
      .exhaustive();
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
