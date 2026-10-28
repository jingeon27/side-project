import { expect, test } from './support/test';

test(
  '프로필 수정은 모바일 시트·데스크톱 모달에서 취소와 저장을 한 행에 보여야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    await signIn('프로필 시트 회귀');
    await page.goto('/me');
    const opener = page.getByRole('button', { name: '프로필 수정', exact: true });
    await opener.click();
    const sheet = page.getByRole('dialog', { name: '프로필 수정', exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: '닫기', exact: true })).toHaveCount(0);
    const cancel = sheet.getByRole('button', { name: '취소', exact: true });
    const save = sheet.getByRole('button', { name: '프로필 저장하기', exact: true });
    const original = await sheet.getByRole('textbox', { name: '닉네임' }).inputValue();
    await sheet.getByRole('textbox', { name: '닉네임' }).fill('저장하지 않은 변경');
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport missing');
    await expect
      .poll(async () => {
        const [box, left, right] = await Promise.all([
          sheet.boundingBox(),
          cancel.boundingBox(),
          save.boundingBox(),
        ]);
        if (!box || !left || !right) return null;
        const layout =
          viewport.width >= 768
            ? box.x > 0 && box.y > 0 && Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2
            : Math.abs(box.x) < 2 &&
              Math.abs(box.width - viewport.width) < 2 &&
              Math.abs(box.y + box.height - viewport.height) < 2;
        return { layout, rowGap: Math.abs(left.y - right.y), widthGap: Math.abs(left.width - right.width) };
      })
      .toMatchObject({ layout: true, rowGap: expect.any(Number), widthGap: expect.any(Number) });
    const [left, right] = await Promise.all([cancel.boundingBox(), save.boundingBox()]);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
    expect(Math.abs(left!.width - right!.width)).toBeLessThan(2);
    await cancel.click();
    await expect(sheet).toHaveCount(0);
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(sheet.getByRole('textbox', { name: '닉네임' })).toHaveValue(original);
    await sheet.getByRole('textbox', { name: '닉네임' }).fill('수정된 프로필');
    await save.click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '수정된 프로필', exact: true })).toBeVisible();
  },
);
