import { saveImage } from '../../../server/assets';
import { errorResponse, readBody, requireLocalRequest, StudioError } from '../../../server/errors';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    if (request.headers.get('content-type') !== 'image/png')
      throw new StudioError('PNG 이미지 업로드 형식이 필요합니다.', 415);
    return Response.json(
      { asset: await saveImage(await readBody(request, 25_000_000)) },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
