import { voiceRunInputSchema } from '../../../../../features/voice/model/voice-training';
import { startVoiceTraining } from '../../../../../features/voice/server/voice-training-provider';
import {
  errorResponse,
  readJson,
  requireLocalRequest,
  StudioError,
} from '../../../../../shared/server/errors';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalRequest(request, true);
    const input = voiceRunInputSchema.safeParse(await readJson(request));
    if (!input.success) throw new StudioError('학습 반복 횟수는 1~20 사이로 입력해 주세요.', 400);
    return Response.json(await startVoiceTraining((await context.params).id, input.data.epochs), {
      status: 202,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
