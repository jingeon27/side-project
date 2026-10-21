import { expect, seedGroup, test } from './support/test';

test(
  '시트는 화면 안에서 본문만 스크롤하고 닫은 뒤 다시 열 수 있어야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('시트 회귀 회원');
    const group = await seedGroup(cookie, '시트 확인 그룹');
    await page.goto(`/groups/${group.id}`);
    const opener = page.getByRole('button', { name: '글쓰기', exact: true });
    await opener.click();
    let sheet = page.getByRole('dialog', { name: '그룹에 글쓰기' });
    await expect(sheet).toBeVisible();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport missing');
    await page.setViewportSize({ width: viewport.width, height: 500 });
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return Boolean(
          box &&
          box.y >= 0 &&
          box.y + box.height <= 501 &&
          Math.abs(box.width - viewport.width) <= 1 &&
          Math.abs(box.x) <= 1,
        );
      })
      .toBe(true);
    const content = sheet.locator('[data-bottom-sheet-content]');
    await expect(sheet.getByLabel('제목', { exact: true })).toHaveAttribute('required', '');
    await expect(sheet.getByLabel('사진·동영상 선택', { exact: true })).toHaveAttribute(
      'aria-required',
      'true',
    );
    await expect(sheet.getByLabel('내용', { exact: true })).not.toHaveAttribute('required');
    await expect(sheet.getByRole('checkbox', { name: /공유할 권리/ })).toHaveAttribute('required', '');
    expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await content.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(sheet.getByRole('button', { name: '게시물 올리기' })).toBeInViewport();
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    sheet = page.getByRole('dialog', { name: '그룹에 글쓰기' });
    await expect(sheet.getByLabel('제목', { exact: true })).toHaveValue('');
    await sheet.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
  },
);
