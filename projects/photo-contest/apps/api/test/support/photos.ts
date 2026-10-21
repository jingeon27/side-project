import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { createTestImage } from '@photo-contest/test-kit';

import { TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from './app';

export interface IUploadTicket {
  id: string;
  /** API가 돌려준 웹 프록시 경로 (/backend/uploads/<token>) */
  url: string;
  expiresAt: string;
  /** API에 직접 보낼 경로 (/uploads/<token>) */
  path: string;
}

const REQUEST_UPLOAD =
  'mutation($contestId: ID!) { requestUploadUrl(contestId: $contestId) { id url expiresAt } }';
export const CREATE_SUBMISSION = `
  mutation($contestId: ID!, $uploadId: ID!, $caption: String!, $rightsConfirmed: Boolean! = true) {
    createSubmission(contestId: $contestId, uploadId: $uploadId, caption: $caption, rightsConfirmed: $rightsConfirmed) {
      id
    }
  }
`;

/** 업로드 티켓을 받는다. 웹은 /backend 프록시를 거치지만 테스트는 API에 바로 보내므로 접두사를 뗀다. */
export async function requestUpload(
  api: ITestApi,
  cookie: string,
  contestId: string,
): Promise<IUploadTicket> {
  const { requestUploadUrl: ticket } = await api.gqlOk<{
    requestUploadUrl: Omit<IUploadTicket, 'path'>;
  }>(cookie, REQUEST_UPLOAD, { contestId });
  return { ...ticket, path: ticket.url.replace(/^\/backend/, '') };
}

/** 브라우저처럼 Origin을 붙여 원본 사진을 올린다. */
export function postPhoto(
  api: ITestApi,
  cookie: string | undefined,
  path: string,
  body: Buffer | string,
  contentType = 'image/png',
) {
  let pending = api.http().post(path).set('Origin', TEST_WEB_ORIGIN).set('Content-Type', contentType);
  if (cookie) pending = pending.set('Cookie', cookie);
  return pending.send(body);
}

/** 티켓을 받아 사진을 올리고 업로드 ID를 돌려준다. */
export async function uploadPhoto(
  api: ITestApi,
  cookie: string,
  contestId: string,
  image?: Buffer,
): Promise<string> {
  const ticket = await requestUpload(api, cookie, contestId);
  const response = await postPhoto(api, cookie, ticket.path, image ?? (await createTestImage()));
  if (response.status !== 201) throw new Error(`사진 업로드 실패 (${response.status}): ${response.text}`);
  return ticket.id;
}

/** 사진을 올리고 제출까지 마친 뒤 제출 ID를 돌려준다. */
export async function submitPhoto(
  api: ITestApi,
  user: ITestUser,
  contestId: string,
  caption: string,
  image?: Buffer,
): Promise<string> {
  const uploadId = await uploadPhoto(api, user.cookie, contestId, image);
  const { createSubmission } = await api.gqlOk<{ createSubmission: { id: string } }>(
    user.cookie,
    CREATE_SUBMISSION,
    { contestId, uploadId, caption },
  );
  return createSubmission.id;
}

/** 앱의 사진 저장소에 그 파일이 남아 있는지 */
export async function storedPhotoExists(api: ITestApi, imageKey: string) {
  try {
    await access(join(api.storageDir, imageKey));
    return true;
  } catch {
    return false;
  }
}

export interface IPhotoListVariables {
  offset?: number | null;
  limit?: number | null;
  sort?: string | null;
}

function photoListQuery(fields: string) {
  return `
    query($contestId: ID!, $offset: Int, $limit: Int, $sort: SubmissionSort) {
      submissions(contestId: $contestId, offset: $offset, limit: $limit, sort: $sort) { ${fields} }
    }
  `;
}

/** 사진 목록 한 페이지(기본 offset 0, 24장)를 viewer 기준으로 받는다. fields는 Submission 선택 집합 */
export async function listPhotos<TNode>(
  api: ITestApi,
  cookie: string,
  contestId: string,
  fields: string,
  variables: IPhotoListVariables = {},
): Promise<TNode[]> {
  const { submissions } = await api.gqlOk<{ submissions: TNode[] }>(cookie, photoListQuery(fields), {
    contestId,
    ...variables,
  });
  return submissions;
}
