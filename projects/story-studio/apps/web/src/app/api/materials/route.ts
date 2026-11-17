import { materialUploadSchema } from '../../../lib/materials';
import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../server/errors';
import { isLocalMode, localConfiguration } from '../../../server/local-worker';
import { addMaterials, listMaterials } from '../../../server/material-store';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    return Response.json(
      { ready: isLocalMode() && localConfiguration().materialReady, materials: await listMaterials() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const upload = materialUploadSchema.safeParse(await readJson(request, 6_000_000));
    if (!upload.success)
      throw new StudioError(
        '묶음 이름과 자료 내용을 확인해 주세요. 자료 하나는 30만 자까지 저장합니다.',
        400,
      );
    return Response.json(
      { materials: await addMaterials(upload.data, request.signal) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
