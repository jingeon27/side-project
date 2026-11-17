import { removeVoiceSample } from '../../../../../../features/voice/server/voice-store';
import { uploadVoiceSample } from '../../../../../../features/voice/server/voice-upload';
import { errorResponse, requireLocalRequest } from '../../../../../../shared/server/errors';

export const runtime = 'nodejs';
type TContext = { params: Promise<{ id: string; sampleId: string }> };
export async function PUT(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    const params = await context.params;
    return Response.json(await uploadVoiceSample(request, params.id, params.sampleId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    const params = await context.params;
    await removeVoiceSample(params.id, params.sampleId);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
