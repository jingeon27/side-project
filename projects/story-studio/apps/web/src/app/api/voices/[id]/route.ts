import {
  getVoiceDataset,
  getVoiceRuns,
  getVoiceSamples,
} from '../../../../features/voice/server/voice-store';
import { errorResponse, requireLocalRequest } from '../../../../shared/server/errors';
import { localConfiguration } from '../../../../shared/server/local-worker';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalRequest(request);
    const id = (await context.params).id;
    const [voice, samples, runs] = await Promise.all([
      getVoiceDataset(id),
      getVoiceSamples(id),
      getVoiceRuns(id),
    ]);
    return Response.json(
      { voice, samples, runs, trainingReady: localConfiguration().voiceTrainingReady },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
