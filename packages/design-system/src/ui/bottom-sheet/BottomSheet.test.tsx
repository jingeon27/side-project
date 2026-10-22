import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { BottomSheet } from './BottomSheet';

it('높이 핸들은 값 글자를 알리고 좌우·PageUp·PageDown 키로도 조절되어야 한다', async () => {
  const user = userEvent.setup();
  render(
    <BottomSheet open onOpenChange={vi.fn()} title="게임 계정">
      <p>내용</p>
    </BottomSheet>,
  );
  const sheet = await screen.findByRole('dialog', { name: '게임 계정' });
  const handle = within(sheet).getByRole('slider', { name: '시트 높이 조절' });
  // 범위가 60~100이라 값만 있으면 스크린 리더가 60을 0%로 읽는다.
  expect(handle).toHaveAttribute('aria-valuetext', '60%');
  handle.focus();

  for (const [key, value] of [
    ['{ArrowRight}', '100'],
    ['{ArrowLeft}', '60'],
    ['{PageUp}', '100'],
    ['{PageDown}', '60'],
    ['{End}', '100'],
  ] as const) {
    await user.keyboard(key);
    expect(handle, key).toHaveAttribute('aria-valuenow', value);
    expect(handle, key).toHaveAttribute('aria-valuetext', `${value}%`);
  }
});
