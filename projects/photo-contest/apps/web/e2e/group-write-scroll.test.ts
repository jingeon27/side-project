import { expect, seedGroup, test } from './support/test';

test(
  '프로필 수정을 취소하고 글쓰기로 이동해도 작은 화면에서 아래 항목과 제출 버튼까지 스크롤할 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const viewer = await signIn('글쓰기 스크롤 회원');
    const group = await seedGroup(viewer, '스크롤 검증 그룹');
    await page.goto(`/groups/${group.id}`);
    await page.getByRole('link', { name: '그룹 프로필 수정', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}/edit`);
    await page
      .getByRole('form', { name: '그룹 프로필 수정' })
      .getByRole('button', { name: '취소', exact: true })
      .click();
    await expect(page).toHaveURL(`/groups/${group.id}`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: '글쓰기', exact: true }).click();
    await expect(page).toHaveURL(`/groups/${group.id}/write`);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport missing');
    await page.setViewportSize({ width: viewport.width, height: 480 });
    const form = page.getByRole('form', { name: '그룹에 글쓰기' });
    await expect(form).toBeVisible();
    await expect(form.getByRole('checkbox', { name: /대회에 참여하기/ })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflowY))
      .not.toBe('hidden');
    const rights = form.getByRole('checkbox', { name: /공유할 권리/ });
    await rights.scrollIntoViewIfNeeded();
    await expect
      .poll(() => form.locator('[data-form-scroll]').evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(rights).toBeInViewport();
    const submit = form.getByRole('button', { name: '게시물 올리기', exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  },
);
