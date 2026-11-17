import { activeWriting } from '../../../features/story/server/writing';
import { errorResponse, requireLocalRequest } from '../../../shared/server/errors';

export const runtime = 'nodejs';
// Lets a reopened studio find the writing it left running.
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    return Response.json({ jobs: activeWriting() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
