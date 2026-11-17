import { voiceNameSchema } from '../../../features/voice/model/voice-training';
import {
  createVoiceDataset,
  listTrainedVoices,
  listVoiceDatasets,
} from '../../../features/voice/server/voice-store';
import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../shared/server/errors';
import { localConfiguration } from '../../../shared/server/local-worker';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const [voices, trained] = await Promise.all([listVoiceDatasets(), listTrainedVoices()]);
    return Response.json(
      { voices, trained, trainingReady: localConfiguration().voiceTrainingReady },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const input = voiceNameSchema.safeParse(await readJson(request));
    if (!input.success) throw new StudioError('목소리 이름을 60자 이내로 입력해 주세요.', 400);
    return Response.json(await createVoiceDataset(input.data.name), {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
