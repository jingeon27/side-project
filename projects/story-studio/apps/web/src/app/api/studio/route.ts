import { match } from 'ts-pattern';
import { z } from 'zod';

import { briefSchema, continueSchema, mediaRequestSchema, voiceRequestSchema } from '../../../lib/story';
import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../server/errors';
import {
  composeLocal,
  configuration,
  continueStory,
  generateDraft,
  generateImage,
  generateVideo,
  generateVoice,
} from '../../../server/provider';

export const runtime = 'nodejs';
export const maxDuration = 300;
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('draft'), input: briefSchema }),
  z.object({ action: z.literal('continue'), input: continueSchema }),
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
      .with({ action: 'draft' }, (action) => generateDraft(action.input, request.signal))
      .with({ action: 'continue' }, (action) => continueStory(action.input, request.signal))
      .with({ action: 'voice' }, (action) => generateVoice(action.input.text, request.signal))
      .with({ action: 'compose' }, (action) => composeLocal(action.input.scenes, request.signal))
      .with({ action: 'image' }, (action) => generateImage(action.input, request.signal))
      .with({ action: 'video' }, (action) => generateVideo(action.input, request.signal))
      .exhaustive();
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
