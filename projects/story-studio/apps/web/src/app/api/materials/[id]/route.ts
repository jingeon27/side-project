import { errorResponse, requireLocalRequest } from '../../../../server/errors';
import { deleteMaterial } from '../../../../server/material-store';

export const runtime = 'nodejs';
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireLocalRequest(request, true);
    return Response.json(await deleteMaterial((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
