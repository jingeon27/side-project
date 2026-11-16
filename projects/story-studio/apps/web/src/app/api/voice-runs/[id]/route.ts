import { z } from 'zod';

import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../../server/errors';
import { getVoiceRun } from '../../../../server/voice-store';
import { cancelVoiceTraining, resumeVoiceTraining } from '../../../../server/voice-training-provider';

export const runtime = 'nodejs';
type TContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: TContext) {
  try {
    requireLocalRequest(request);
    return Response.json(await getVoiceRun((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    if (!z.object({ action: z.literal('resume') }).safeParse(await readJson(request)).success)
      throw new StudioError('학습 이어하기 요청을 확인해 주세요.', 400);
    return Response.json(await resumeVoiceTraining((await context.params).id), {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    return Response.json(await cancelVoiceTraining((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
