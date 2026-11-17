import { z } from 'zod';

import {
  deleteProject,
  ProjectConflictError,
  readProject,
  saveProject,
} from '../../../../features/library/server/project-store';
import { projectSchema } from '../../../../features/story/model/story';
import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../../shared/server/errors';

export const runtime = 'nodejs';
type TContext = { params: Promise<{ id: string }> };
const saveSchema = z.object({ project: projectSchema, base: z.string().nullable() });
export async function GET(request: Request, context: TContext) {
  try {
    requireLocalRequest(request);
    return Response.json(await readProject((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    const input = saveSchema.safeParse(await readJson(request, 12_000_000));
    if (!input.success || input.data.project.id !== (await context.params).id)
      throw new StudioError('작품 내용을 확인해 주세요. 작품은 최대 80개 장면까지 저장합니다.', 400);
    return Response.json(await saveProject(input.data.project, input.data.base), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    // The caller replaces its copy with the stored one instead of overwriting it.
    if (error instanceof ProjectConflictError)
      return Response.json(
        { error: error.message, project: error.current },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: TContext) {
  try {
    requireLocalRequest(request, true);
    return Response.json(await deleteProject((await context.params).id), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
