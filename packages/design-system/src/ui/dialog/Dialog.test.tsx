import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Dialog } from './Dialog';
import { DialogContent, DialogRoot, DialogTitle } from './DialogParts';

// 여러 언어 앱이 쓰는 패키지라 한국어 기본 이름('닫기')을 두지 않는다. 이름이 없으면 타입 오류다.
export function MissingCloseLabels() {
  return (
    <>
      {/* @ts-expect-error 닫기 버튼 이름은 소비 앱이 번역해 넘긴다. */}
      <Dialog open onOpenChange={() => undefined} title="Language">
        내용
      </Dialog>
      <DialogRoot open>
        {/* @ts-expect-error 닫기 버튼을 그리면 closeLabel이 필요하다. */}
        <DialogContent>
          <DialogTitle>Notifications</DialogTitle>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

it('DialogContent는 소비 앱이 넘긴 닫기 이름만 쓰고 한국어 기본 이름을 붙이지 않아야 한다', async () => {
  render(
    <DialogRoot open>
      <DialogContent closeLabel="Close">
        <DialogTitle>Notifications</DialogTitle>
      </DialogContent>
    </DialogRoot>,
  );
  await screen.findByRole('dialog', { name: 'Notifications' });
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
});

it('닫기 버튼을 숨긴 DialogContent는 이름 없이 쓸 수 있어야 한다', async () => {
  render(
    <DialogRoot open>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Required</DialogTitle>
      </DialogContent>
    </DialogRoot>,
  );
  await screen.findByRole('dialog', { name: 'Required' });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
