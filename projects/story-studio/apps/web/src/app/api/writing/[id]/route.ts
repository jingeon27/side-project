import { cancelWriting, writingStatus } from '../../../../features/story/server/writing';
import { errorResponse, requireLocalRequest } from '../../../../shared/server/errors';

export const runtime = 'nodejs';
type TContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: TContext) {
  try {
    requireLocalRequest(request);
    return Response.json(writingStatus((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    return Response.json(cancelWriting((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
