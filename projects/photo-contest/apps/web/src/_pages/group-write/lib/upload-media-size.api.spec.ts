import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';
import { describe, expect, inject, it } from 'vitest';

import { createTestUser, graphqlRequest } from '@photo-contest/test-kit';

import { CreateGroupDocument, RequestPostUploadDocument } from '@/shared/api/generated';

import { MAX_MEDIA_SIDE } from './upload-media-size.helper';

const url = inject('apiUrl');
const origin = 'http://localhost:3321';

function execute<TData, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVariables>,
  cookie: string,
  variables: TVariables,
) {
  return graphqlRequest<TData>(url, { query: print(document), cookie, variables, origin });
}

describe('글쓰기가 보내는 미디어 크기 상한', () => {
  // API 상한만 낮아지면 웹은 크기를 계속 보내고 발급이 거절돼 올리기 자체가 막힌다.
  it('웹이 보내는 가장 큰 가로·세로는 받고 1px 넘으면 입력 오류로 거절해야 한다', async () => {
    const cookie = await createTestUser(url, { nickname: '크기-상한', origin });
    const created = await execute(CreateGroupDocument, cookie, { name: '크기 상한 그룹' });
    const groupId = created.data?.createGroup.id;
    if (!groupId) throw new Error(JSON.stringify(created.errors));
    const requestUpload = (side: number) =>
      execute(RequestPostUploadDocument, cookie, {
        groupId,
        contentType: 'image/png',
        byteSize: 1024,
        width: side,
        height: side,
      });

    const accepted = await requestUpload(MAX_MEDIA_SIDE);
    expect(accepted.errors).toBeUndefined();
    expect(accepted.data?.requestPostUpload.id).toBeTruthy();

    const rejected = await requestUpload(MAX_MEDIA_SIDE + 1);
    expect(rejected.data?.requestPostUpload ?? null).toBeNull();
    expect(rejected.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  });
});
