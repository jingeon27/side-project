import { S3ServiceException } from '@aws-sdk/client-s3';
import { captureException } from '@sentry/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { ERROR_MESSAGE } from '../common/errors';

vi.mock('@sentry/node', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/node')>()),
  captureException: vi.fn(),
}));

const FLOWS = [
  {
    kind: '게시물',
    request: 'mutation($group:ID!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:4){id}}',
    requestField: 'requestPostUpload',
    complete: 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}',
  },
  {
    kind: '프로필',
    request: 'mutation{requestProfileAvatarUpload(contentType:"image/png",byteSize:4){id}}',
    requestField: 'requestProfileAvatarUpload',
    complete: 'mutation($id:ID!){completeProfileAvatarUpload(uploadId:$id){id}}',
  },
] as const;

describe('실제 업로드 완료의 저장소 장애 회귀', () => {
  const state: { api?: ITestApi; owner?: ITestUser; groupId?: string } = {};
  function fixture() {
    if (!state.api || !state.owner || !state.groupId)
      throw new Error('Expected an isolated storage fixture.');
    return { api: state.api, owner: state.owner, groupId: state.groupId };
  }
  beforeAll(async () => {
    state.api = await createTestApp(
      {
        S3_BUCKET: 'head-signing-only',
        S3_REGION: 'ap-northeast-2',
        S3_ENDPOINT: '',
        AWS_ACCESS_KEY_ID: 'unit-signing-key',
        AWS_SECRET_ACCESS_KEY: 'unit-signing-secret',
        AWS_SESSION_TOKEN: '',
      },
      { shutdownHooks: false },
    );
    state.owner = await state.api.signIn('HEAD장애-그룹장');
    state.groupId = (await createGroup(state.api, state.owner, 'HEAD 장애 회귀')).id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await state.api?.close();
  });

  it.each(FLOWS)(
    '$kind 완료는 객체 누락과 저장소 장애를 구분하고 내부 원인을 정리해 보고해야 한다',
    async (flow) => {
      const { api, owner, groupId } = fixture();
      const data = await api.gqlOk<Record<string, { id: string }>>(owner.cookie, flow.request, {
        group: groupId,
      });
      const id = data[flow.requestField]?.id;
      expect(id).toEqual(expect.any(String));
      const head = vi.spyOn(api.storage, 'head');
      const missing = new S3ServiceException({
        name: 'NotFound',
        message: 'private-key',
        $fault: 'client',
        $metadata: { httpStatusCode: 404 },
      });
      vi.mocked(captureException).mockClear();
      head.mockRejectedValueOnce(missing);
      const notUploaded = await api.gqlFail(owner.cookie, flow.complete, { id });
      expect(notUploaded.code).toBe('BAD_USER_INPUT');
      expect(captureException).not.toHaveBeenCalled();

      for (const failure of [
        new S3ServiceException({
          name: 'AccessDenied',
          message: 'private-credentials',
          $fault: 'client',
          $metadata: { httpStatusCode: 403 },
        }),
        new S3ServiceException({
          name: 'SlowDown',
          message: 'private-bucket',
          $fault: 'server',
          $metadata: { httpStatusCode: 503 },
        }),
        Object.assign(new Error('private-timeout'), { name: 'TimeoutError' }),
      ]) {
        vi.mocked(captureException).mockClear();
        head.mockRejectedValueOnce(failure);
        const rejected = await api.gqlFail(owner.cookie, flow.complete, { id });
        expect(rejected).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGE.INTERNAL });
        expect(captureException).toHaveBeenCalledTimes(1);
        const call = vi.mocked(captureException).mock.calls[0];
        const reported: unknown = call?.[0];
        expect(reported).toMatchObject({ message: `Unexpected ${failure.name}` });
        if (!(reported instanceof Error)) throw new Error('Expected a sanitized storage exception.');
        expect([reported.message, reported.stack, JSON.stringify(call?.[1])].join('\n')).not.toContain(
          'private',
        );
      }
    },
  );
});
