import { match } from 'ts-pattern';

import { collectionNameSchema, materialActionSchema } from '../../../lib/materials';
import { errorResponse, readJson, requireLocalRequest, StudioError } from '../../../server/errors';
import {
  addMaterials,
  deleteCollection,
  importInbox,
  listCollection,
  materialOverview,
  startSync,
  stopSync,
} from '../../../server/material-store';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const collection = new URL(request.url).searchParams.get('collection');
    if (collection !== null && !collectionNameSchema.safeParse(collection).success)
      throw new StudioError('올바른 자료 묶음이 아닙니다.', 400);
    return Response.json(collection === null ? await materialOverview() : await listCollection(collection), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const input = materialActionSchema.safeParse(await readJson(request, 6_000_000));
    if (!input.success)
      throw new StudioError(
        '묶음 이름과 자료 내용을 확인해 주세요. 자료 하나는 30만 자, 항상 포함할 자료는 6천 자까지 저장합니다.',
        400,
      );
    const data = await match(input.data)
      .with({ action: 'upload' }, (action) => addMaterials(action.upload))
      .with({ action: 'import' }, () => importInbox())
      .with({ action: 'delete-collection' }, (action) => deleteCollection(action.collection))
      .with({ action: 'sync' }, () => {
        startSync();
        return { started: true };
      })
      .with({ action: 'stop' }, () => {
        stopSync();
        return { stopped: true };
      })
      .exhaustive();
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
