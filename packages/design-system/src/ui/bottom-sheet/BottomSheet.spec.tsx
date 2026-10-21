import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '../button/Button';
import { TextField } from '../text-field/TextField';
import { BottomSheet } from './BottomSheet';

function SheetExample({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>계정 등록</Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="게임 계정"
        description="플레이어 태그를 입력하세요."
        dismissible={dismissible}
      >
        <TextField label="플레이어 태그" />
        <Button onClick={() => setOpen(false)}>완료</Button>
      </BottomSheet>
    </>
  );
}

describe('BottomSheet', () => {
  it('키보드로 높이를 조절해도 입력을 보존하며 닫으면 연 버튼으로 포커스를 복원해야 한다', async () => {
    const user = userEvent.setup();
    render(<SheetExample />);
    const opener = screen.getByRole('button', { name: '계정 등록' });
    await user.click(opener);
    const sheet = await screen.findByRole('dialog', { name: '게임 계정' });
    expect(sheet).toHaveAccessibleDescription('플레이어 태그를 입력하세요.');
    const input = within(sheet).getByRole('textbox', { name: '플레이어 태그' });
    await user.type(input, '#GG829JGY');
    const handle = within(sheet).getByRole('slider', { name: '시트 높이 조절' });
    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(handle).toHaveAttribute('aria-valuenow', '100');
    await user.keyboard('{Home}');
    expect(handle).toHaveAttribute('aria-valuenow', '60');
    await user.keyboard('{Enter}');
    expect(handle).toHaveAttribute('aria-valuenow', '100');
    expect(input).toHaveValue('#GG829JGY');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('필수 처리 중에는 Esc로 닫히지 않고 명시적인 완료로 닫혀야 한다', async () => {
    const user = userEvent.setup();
    render(<SheetExample dismissible={false} />);
    await user.click(screen.getByRole('button', { name: '계정 등록' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '완료' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
