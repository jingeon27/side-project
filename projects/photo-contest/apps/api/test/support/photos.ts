import { createTestImage } from '@photo-contest/test-kit';

import { uploadToStorage, type ITestApi, type ITestUser } from './app';

export interface IUploadTicket {
  id: string;
  fields: Array<{ name: string; value: string }>;
  /** 서명 POST를 받는 저장소 주소 */
  url: string;
  expiresAt: string;
}

const REQUEST_UPLOAD =
  'mutation($contestId: ID!, $size: Int!, $type: String!) { requestUploadUrl(contestId: $contestId,contentType:$type,byteSize:$size) { id url fields{name value} expiresAt } }';
export const CREATE_SUBMISSION = `
  mutation($contestId: ID!, $uploadId: ID!, $caption: String!, $rightsConfirmed: Boolean! = true) {
    createSubmission(contestId: $contestId, uploadId: $uploadId, caption: $caption, rightsConfirmed: $rightsConfirmed) {
      id
    }
  }
`;

/** 업로드 티켓을 받는다. */
export async function requestUpload(
  api: ITestApi,
  cookie: string,
  contestId: string,
  body?: Buffer,
  contentType = 'image/png',
): Promise<IUploadTicket> {
  const { requestUploadUrl: ticket } = await api.gqlOk<{ requestUploadUrl: IUploadTicket }>(
    cookie,
    REQUEST_UPLOAD,
    { contestId, size: (body ?? (await createTestImage())).length, type: contentType },
  );
  return ticket;
}

/** 브라우저처럼 서명 POST로 원본 사진을 저장소에 바로 올린다. */
export function postPhoto(ticket: IUploadTicket, body: Buffer | string, contentType = 'image/png') {
  return uploadToStorage(ticket, Buffer.isBuffer(body) ? body : Buffer.from(body), contentType);
}
export const COMPLETE_UPLOAD = 'mutation($id: ID!) { completeSubmissionUpload(uploadId:$id) }';

/** 티켓을 받아 사진을 올리고 업로드 ID를 돌려준다. */
export async function uploadPhoto(
  api: ITestApi,
  cookie: string,
  contestId: string,
  image?: Buffer,
): Promise<string> {
  const body = image ?? (await createTestImage());
  const ticket = await requestUpload(api, cookie, contestId, body);
  const response = await postPhoto(ticket, body);
  if (response.status !== 204)
    throw new Error(`사진 업로드 실패 (${response.status}): ${await response.text()}`);
  await api.gqlOk(cookie, COMPLETE_UPLOAD, { id: ticket.id });
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
    await api.storage.head(imageKey);
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
