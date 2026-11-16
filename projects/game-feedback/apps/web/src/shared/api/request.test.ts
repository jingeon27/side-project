import { expect, it } from 'vitest';

import { translate } from '@/shared/i18n/messages';

import { ApiError, withApiError } from './request';

// 409 POST_CONFLICT는 사전에 없는 서버 원문을 그대로 보여서 영어·일본어 화면에도 한국어로 나왔다.
it('replaces a post request conflict with dictionary copy that English and Japanese screens can translate', async () => {
  const error = await withApiError(
    Promise.reject(
      new ApiError(409, 'POST_CONFLICT', '이미 등록된 글입니다. 설정의 내가 작성한 글에서 확인해주세요.'),
    ),
  ).catch((reason: unknown) => reason);
  expect(error).toMatchObject({
    status: 409,
    errorCode: 'POST_CONFLICT',
    message: '이미 등록된 글이에요. 설정의 내가 작성한 글에서 확인해 주세요.',
  });
  const message = error instanceof Error ? error.message : '';
  expect(translate('en', message)).toBe('This post was already published. Check My posts in Settings.');
  expect(translate('ja', message)).toBe(
    'この投稿はすでに登録されています。設定の自分の投稿で確認してください。',
  );
});
