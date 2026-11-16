import { assetResponse } from '../../../../server/assets';
import { errorResponse, requireLocalRequest } from '../../../../server/errors';

export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    requireLocalRequest(request);
    return await assetResponse((await context.params).filename, request.headers.get('range'));
  } catch (error) {
    return errorResponse(error);
  }
}
