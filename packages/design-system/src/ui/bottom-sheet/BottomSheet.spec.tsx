import { useState } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button/Button';
import { TextField } from '../text-field/TextField';
import { BottomSheet, type TBottomSheetSnapPoint } from './BottomSheet';

function SheetExample({ dismissible = true }: { dismissible?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>계정 등록</Button>
      <BottomSheet
        open={open}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
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

function FooterSheetExample({ onSave }: { onSave: (value: FormDataEntryValue | null) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <BottomSheet
      open={open}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      title="프로필 수정"
      responsive
      showCloseButton={false}
      footer={
        <>
          <Button type="button" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="submit" form="profile-form">
            저장
          </Button>
        </>
      }
    >
      <form
        id="profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(new FormData(event.currentTarget).get('nickname'));
          setOpen(false);
        }}
      >
        <TextField label="닉네임" name="nickname" required />
      </form>
    </BottomSheet>
  );
}

describe('BottomSheet', () => {
  it('상단 닫기 없이 본문 밖 하단 버튼으로 폼 검증과 제출을 실행해야 한다', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<FooterSheetExample onSave={onSave} />);
    const sheet = await screen.findByRole('dialog', { name: '프로필 수정' });
    expect(within(sheet).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(onSave).not.toHaveBeenCalled();
    await user.type(within(sheet).getByRole('textbox', { name: '닉네임' }), '플레이어');
    await user.click(within(sheet).getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith('플레이어');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

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

function CommentsSheet({
  onClosed,
  snapPoints,
}: {
  onClosed: () => void;
  snapPoints?: TBottomSheetSnapPoint[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <BottomSheet.Root
      open={open}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) onClosed();
      }}
      snapPoints={snapPoints}
    >
      <BottomSheet.Handle label="Resize sheet" />
      <BottomSheet.Header
        title={
          <>
            댓글 <span aria-hidden="true">·</span> 12
          </>
        }
        description="최신순으로 보여요."
      >
        <BottomSheet.Close label="Close" />
      </BottomSheet.Header>
      <BottomSheet.Content className="px-5">
        <p>첫 댓글</p>
      </BottomSheet.Content>
      <BottomSheet.Footer>
        <Button type="button">댓글 쓰기</Button>
      </BottomSheet.Footer>
    </BottomSheet.Root>
  );
}

function ControlledSheet({
  onSnapPointChange,
}: {
  onSnapPointChange: (point: TBottomSheetSnapPoint) => void;
}) {
  const [snapPoint, setSnapPoint] = useState<TBottomSheetSnapPoint>(0.4);
  return (
    <BottomSheet.Root
      open
      onOpenChange={() => undefined}
      snapPoints={[0.4, '480px', 1]}
      snapPoint={snapPoint}
      onSnapPointChange={(nextSnapPoint) => {
        onSnapPointChange(nextSnapPoint);
        setSnapPoint(nextSnapPoint);
      }}
    >
      <BottomSheet.Handle label="높이" />
      <BottomSheet.Header title="필터" />
      <BottomSheet.Content>필터 목록</BottomSheet.Content>
    </BottomSheet.Root>
  );
}

describe('BottomSheet 조합 API', () => {
  it('고정 높이 시트는 손잡이를 장식으로만 그리고 슬롯·닫기·닫힘 완료를 지원해야 한다', async () => {
    const user = userEvent.setup();
    const onClosed = vi.fn();
    render(<CommentsSheet onClosed={onClosed} snapPoints={[0.75]} />);
    const sheet = await screen.findByRole('dialog', { name: '댓글 12' });
    expect(sheet).toHaveAccessibleDescription('최신순으로 보여요.');
    expect(sheet).not.toHaveAttribute('data-fit-content');
    expect(within(sheet).queryByRole('slider')).not.toBeInTheDocument();
    expect(sheet.querySelector('[data-decorative]')).toHaveAttribute('aria-hidden', 'true');
    expect(within(sheet).getByText('첫 댓글').parentElement).toHaveClass('ds-sheet-body', 'px-5');
    expect(sheet.querySelector('[data-slot="bottom-sheet-footer"]')).toContainElement(
      within(sheet).getByRole('button', { name: '댓글 쓰기' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('snapPoints가 없으면 내용 높이로 열어야 한다', async () => {
    render(<CommentsSheet onClosed={() => undefined} />);
    const sheet = await screen.findByRole('dialog', { name: '댓글 12' });
    expect(sheet).toHaveAttribute('data-fit-content');
    expect(within(sheet).queryByRole('slider')).not.toBeInTheDocument();
  });

  it('snapPoints 여러 개를 키보드로 차례로 오가고 제어형 높이를 따라야 한다', async () => {
    const user = userEvent.setup();
    const onSnapPointChange = vi.fn();
    render(<ControlledSheet onSnapPointChange={onSnapPointChange} />);
    const sheet = await screen.findByRole('dialog', { name: '필터' });
    const handle = within(sheet).getByRole('slider', { name: '높이' });
    // px 값이 섞이면 비율 대신 단계(1~3)와 그 값을 알린다.
    expect(handle).toHaveAttribute('aria-valuemin', '1');
    expect(handle).toHaveAttribute('aria-valuemax', '3');
    expect(handle).toHaveAttribute('aria-valuetext', '40%');
    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(onSnapPointChange).toHaveBeenLastCalledWith('480px');
    expect(handle).toHaveAttribute('aria-valuenow', '2');
    expect(handle).toHaveAttribute('aria-valuetext', '480px');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(handle).toHaveAttribute('aria-valuenow', '3');
    await user.keyboard('{Enter}');
    expect(handle).toHaveAttribute('aria-valuenow', '1');
    await user.keyboard('{End}');
    expect(onSnapPointChange).toHaveBeenLastCalledWith(1);
    await user.keyboard('{Home}');
    expect(onSnapPointChange).toHaveBeenLastCalledWith(0.4);
  });
});
