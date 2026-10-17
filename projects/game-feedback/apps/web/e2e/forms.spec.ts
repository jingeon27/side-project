import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:3301';

test('post and comment forms edit, cancel deletion, and delete through their overlays', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const signedIn = await page.request.post('/api/auth/demo', {
    headers: { Origin: origin },
    data: { nickname: `폼작성자_${suffix}` },
  });
  expect(signedIn.ok()).toBeTruthy();
  const categories = await (await page.request.get('/api/categories')).json();
  const created = await page.request.post('/api/posts', {
    headers: { Origin: origin },
    data: {
      title: `수정할 피드백 요청 ${suffix}`,
      body: '호그 순환 덱에서 수비 건물을 먼저 배치하는 타이밍에 대해 함께 이야기하고 싶어요.',
      categoryId: categories[0].id,
    },
  });
  expect(created.ok()).toBeTruthy();
  const post = await created.json();
  await page.goto(`/ko/posts/${post.id}`);

  await page.locator('.detail-card').getByRole('button', { name: '수정', exact: true }).click();
  const postEditor = page.getByRole('dialog', { name: '피드백 요청 수정' });
  const title = `수정한 피드백 요청 ${suffix}`;
  await postEditor.getByLabel('제목', { exact: true }).fill(title);
  await postEditor.getByRole('button', { name: '수정 완료', exact: true }).click();
  await expect(postEditor).not.toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(`${title} | 플레이메이트`);

  const commentBody = `방금 수정한 요청에 댓글을 남겨요. ${suffix}`;
  await page.getByRole('textbox', { name: '댓글 내용', exact: true }).fill(commentBody);
  await page.getByRole('button', { name: '댓글 등록', exact: true }).click();
  const comment = page.locator('article.comment').filter({ hasText: commentBody });
  await expect(comment).toBeVisible();
  await comment.getByRole('button', { name: '수정', exact: true }).click();
  const commentEditor = page.getByRole('dialog', { name: '댓글 수정' });
  const editedBody = `댓글도 수정하고 저장했어요. ${suffix}`;
  await commentEditor.getByRole('textbox', { name: '수정 내용' }).fill(editedBody);
  await commentEditor.getByRole('button', { name: '수정 완료', exact: true }).click();
  await expect(commentEditor).not.toBeVisible();
  const editedComment = page.locator('article.comment').filter({ hasText: editedBody });
  await expect(editedComment).toBeVisible();

  await editedComment.getByRole('button', { name: '삭제', exact: true }).click();
  await page
    .getByRole('dialog', { name: '정말 삭제할까요?' })
    .getByRole('button', { name: '돌아가기' })
    .click();
  await expect(editedComment).toBeVisible();
  await editedComment.getByRole('button', { name: '삭제', exact: true }).click();
  await page
    .getByRole('dialog', { name: '정말 삭제할까요?' })
    .getByRole('button', { name: '삭제하기' })
    .click();
  await expect(editedComment).toHaveCount(0);

  await page.locator('.detail-card').getByRole('button', { name: '삭제', exact: true }).click();
  await page
    .getByRole('dialog', { name: '정말 삭제할까요?' })
    .getByRole('button', { name: '삭제하기' })
    .click();
  await expect(page).toHaveURL('/ko');
  expect((await page.request.get(`/api/posts/${post.id}`)).status()).toBe(404);
});

test('feed filters survive opening a post, returning, and reloading the shared URL', async ({ page }) => {
  const suffix = Date.now().toString(36);
  await page.request.post('/api/auth/demo', {
    headers: { Origin: origin },
    data: { nickname: `검색작성자_${suffix}` },
  });
  const categories = await (await page.request.get('/api/categories')).json();
  const title = `검색과 복귀 확인 ${suffix}`;
  const created = await page.request.post('/api/posts', {
    headers: { Origin: origin },
    data: {
      title,
      body: '검색한 요청을 열고 돌아왔을 때 필터와 검색 조건이 그대로 남아있는지 확인하는 피드백 요청입니다.',
      categoryId: categories[0].id,
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto('/ko?from=filters');
  await page.getByRole('textbox', { name: '게시글 검색', exact: true }).fill(suffix);
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === suffix);
  await expect(page.locator('.post-list .post-card')).toHaveCount(1);
  await page.getByRole('tab', { name: '답변을 기다려요' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('tab') === 'unanswered');
  await page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('textbox', { name: '게시글 검색', exact: true })).toHaveValue(suffix);
  await expect(page.getByRole('tab', { name: '답변을 기다려요' })).toHaveAttribute('aria-selected', 'true');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '게시글 검색', exact: true })).toHaveValue(suffix);
  await expect(page.locator('.post-list .post-card')).toHaveCount(1);
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      !url.searchParams.has('q') &&
      url.searchParams.get('tab') === 'unanswered' &&
      url.searchParams.get('from') === 'filters',
  );
});

test('a session changed outside the screen clears the previous account confirmation dialog', async ({
  page,
}) => {
  const signedIn = await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-0' },
  });
  expect(signedIn.ok()).toBeTruthy();
  await page.goto('/ko/settings');
  await expect(page.locator('.settings-profile')).toContainText('새벽의호그');
  await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '플레이메이트를 떠나시겠어요?' });
  await dialog.getByRole('textbox').fill('탈퇴');
  await expect(dialog.getByRole('button', { name: '계정 영구 삭제하기' })).toBeEnabled();

  // An API login shares cookies like another tab, without running this screen's login mutation.
  const switched = await page.request.post('/api/auth/test-login', {
    headers: { Origin: origin },
    data: { accountId: 'sample-user-3' },
  });
  expect(switched.ok()).toBeTruthy();
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.settings-profile')).toContainText('덱연구소');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue('');
  await expect(dialog.getByRole('button', { name: '계정 영구 삭제하기' })).toBeDisabled();
  const session = await (await page.request.get('/api/session')).json();
  expect(session.user.id).toBe('sample-user-3');
});
