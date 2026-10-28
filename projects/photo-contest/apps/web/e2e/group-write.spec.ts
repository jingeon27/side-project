import { expect, seedGroup, test } from './support/test';

test(
  '글쓰기는 직접 열고 새로고침할 수 있는 페이지이며 뒤로 가기와 등록이 그룹으로 이어져야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('글쓰기 페이지 회원');
    const group = await seedGroup(cookie, '글쓰기 페이지 그룹');
    const path = `/groups/${group.id}`;
    await page.goto(path);
    await page.getByRole('link', { name: '글쓰기', exact: true }).click();
    await expect(page).toHaveURL(`${path}/write`);
    await page.reload();
    const form = page.getByRole('form', { name: '그룹에 글쓰기', exact: true });
    await expect(form).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(form.getByLabel('제목', { exact: true })).toHaveAttribute('required', '');
    await expect(form.getByLabel('사진 또는 동영상 선택')).toHaveAttribute('aria-required', 'true');
    await expect(form.getByLabel('내용', { exact: true })).not.toHaveAttribute('required');
    await page.getByRole('button', { name: '뒤로 가기', exact: true }).click();
    await expect(page).toHaveURL(path);
    await page.getByRole('link', { name: '글쓰기', exact: true }).click();
    await form.getByLabel('제목', { exact: true }).fill('페이지에서 올린 순간');
    await form.getByLabel('첨부 링크', { exact: true }).fill('https://example.com/moment');
    await form.getByRole('checkbox', { name: /공유할 권리/ }).check();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport missing');
    await page.setViewportSize({ width: viewport.width, height: 500 });
    await form.getByRole('button', { name: '게시물 올리기' }).scrollIntoViewIfNeeded();
    await expect(form.getByRole('button', { name: '게시물 올리기' })).toBeInViewport();
    await form.getByRole('button', { name: '게시물 올리기' }).click();
    await expect(page).toHaveURL(path);
    await expect(
      page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: '페이지에서 올린 순간', exact: true }),
    ).toBeVisible();
    await signIn('가입하지 않은 글쓰기 방문자');
    await page.goto(`${path}/write`);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('form', { name: '그룹에 글쓰기' })).toHaveCount(0);
  },
);
