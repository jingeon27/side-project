import { errorResponse, requireLocalRequest } from '../../../../server/errors';
import { cancelLocalVideo } from '../../../../server/local-worker';
import { videoStatus } from '../../../../server/provider';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalRequest(request);
    return Response.json(await videoStatus((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalRequest(request, true);
    return Response.json(await cancelLocalVideo((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
