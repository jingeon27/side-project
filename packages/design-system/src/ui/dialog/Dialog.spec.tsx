import { useState } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button/Button';
import { TextField } from '../text-field/TextField';
import { Dialog } from './Dialog';

function DialogExample({ onComplete }: { onComplete: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>프로필 설정</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={onComplete}
        title="프로필"
        description="사용할 이름을 설정해요."
        closeLabel="닫기"
      >
        <TextField label="닉네임" />
        <Button onClick={() => setNested(true)}>추가 설정</Button>
        <Dialog open={nested} onOpenChange={setNested} title="공개 범위" closeLabel="닫기">
          <TextField label="공개 이름" />
        </Dialog>
      </Dialog>
    </>
  );
}

function RequiredDialog() {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="필수 확인" dismissible={false} closeLabel="닫기">
      <Button onClick={() => setOpen(false)}>동의하고 계속</Button>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('uses the close label supplied by the consuming application', async () => {
    render(
      <Dialog open onOpenChange={() => undefined} title="Language" closeLabel="Close">
        <p>English content</p>
      </Dialog>,
    );
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });
  it('입력과 중첩 대화상자를 사용할 수 있고 닫은 뒤 연 버튼으로 포커스를 돌려야 한다', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<DialogExample onComplete={onComplete} />);
    const opener = screen.getByRole('button', { name: '프로필 설정' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: '프로필' });
    expect(dialog).toHaveAccessibleDescription('사용할 이름을 설정해요.');
    await user.type(within(dialog).getByRole('textbox', { name: '닉네임' }), '새벽의호그');
    expect(within(dialog).getByRole('textbox', { name: '닉네임' })).toHaveValue('새벽의호그');
    const nestedOpener = within(dialog).getByRole('button', { name: '추가 설정' });
    await user.click(nestedOpener);
    const nested = await screen.findByRole('dialog', { name: '공개 범위' });
    await user.type(within(nested).getByRole('textbox', { name: '공개 이름' }), '호그');
    await user.click(within(nested).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '공개 범위' })).not.toBeInTheDocument());
    await waitFor(() => expect(nestedOpener).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('필수 확인은 Esc로 닫히지 않고 명시적인 완료 동작으로 닫혀야 한다', async () => {
    const user = userEvent.setup();
    render(<RequiredDialog />);
    await screen.findByRole('dialog', { name: '필수 확인' });
    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '필수 확인' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '동의하고 계속' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
