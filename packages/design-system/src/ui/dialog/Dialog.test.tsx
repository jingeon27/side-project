import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { DialogContent, DialogRoot, DialogTitle } from './DialogParts';

it('DialogContent의 닫기 버튼 기본 이름은 Dialog·BottomSheet와 같은 "닫기"여야 한다', async () => {
  render(
    <DialogRoot open>
      <DialogContent>
        <DialogTitle>알림 설정</DialogTitle>
      </DialogContent>
    </DialogRoot>,
  );
  await screen.findByRole('dialog', { name: '알림 설정' });
  expect(screen.getByRole('button', { name: '닫기' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
});
