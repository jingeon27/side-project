import { readFile } from 'node:fs/promises';

import { projectSchema } from '../../../lib/story';
import { dataPath, examplePath } from '../../../server/assets';
import { errorResponse, requireLocalRequest, StudioError } from '../../../server/errors';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const raw = await readFile(dataPath('demo-project.json'), 'utf8')
      .catch(() => readFile(examplePath('project.json'), 'utf8'))
      .catch(() => {
        throw new StudioError('이 컴퓨터에서 만든 데모 작품이 아직 없습니다.', 404);
      });
    return Response.json(projectSchema.parse(JSON.parse(raw)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
