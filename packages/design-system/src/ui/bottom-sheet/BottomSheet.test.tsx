import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { BottomSheet } from './BottomSheet';

// 여러 언어 앱이 쓰는 패키지라 한국어 기본 이름('닫기'·'시트 높이 조절')을 두지 않는다. 이름이 없으면 타입 오류다.
export function MissingSheetLabels() {
  return (
    <>
      {/* @ts-expect-error closeLabel·resizeLabel은 소비 앱이 번역해 넘긴다. */}
      <BottomSheet open onOpenChange={() => undefined} title="Game account">
        내용
      </BottomSheet>
      <BottomSheet.Root open onOpenChange={() => undefined} snapPoints={[0.6, 1]}>
        {/* @ts-expect-error 높이 조절 손잡이에는 이름이 필요하다. */}
        <BottomSheet.Handle />
        <BottomSheet.Header title="Game account">
          {/* @ts-expect-error 닫기 버튼에는 이름이 필요하다. */}
          <BottomSheet.Close />
        </BottomSheet.Header>
      </BottomSheet.Root>
    </>
  );
}

it('닫기·높이 조절 이름은 소비 앱이 넘긴 글자만 써야 한다', async () => {
  render(
    <BottomSheet
      open
      onOpenChange={() => undefined}
      title="Game account"
      closeLabel="Close"
      resizeLabel="Resize sheet"
    >
      <p>Content</p>
    </BottomSheet>,
  );
  const sheet = await screen.findByRole('dialog', { name: 'Game account' });
  expect(within(sheet).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  expect(within(sheet).getByRole('slider', { name: 'Resize sheet' })).toBeInTheDocument();
  expect(within(sheet).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  expect(within(sheet).queryByRole('slider', { name: '시트 높이 조절' })).not.toBeInTheDocument();
});

it('높이 핸들은 값 글자를 알리고 좌우·PageUp·PageDown 키로도 조절되어야 한다', async () => {
  const user = userEvent.setup();
  render(
    <BottomSheet
      open
      onOpenChange={() => undefined}
      title="게임 계정"
      closeLabel="닫기"
      resizeLabel="시트 높이 조절"
    >
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
