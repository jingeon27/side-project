import { listProjects } from '../../../features/library/server/project-store';
import { errorResponse, requireLocalRequest } from '../../../shared/server/errors';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    return Response.json(await listProjects(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
