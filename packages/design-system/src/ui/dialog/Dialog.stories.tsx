import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from '../button/Button';
import { TextField } from '../text-field/TextField';
import { Dialog, type IDialogProps } from './Dialog';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from './DialogParts';

function DialogExample(args: IDialogProps) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    args.onOpenChange(nextOpen);
  }

  return (
    <>
      <Button onClick={() => handleOpenChange(true)}>대화상자 열기</Button>
      <Dialog {...args} open={open} onOpenChange={handleOpenChange}>
        {args.children}
        <DialogFooter>
          {args.dismissible !== false ? (
            <Button variant="secondary" onClick={() => handleOpenChange(false)}>
              취소
            </Button>
          ) : null}
          <Button onClick={() => handleOpenChange(false)}>
            {args.dismissible === false ? '확인하고 계속' : '저장'}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function ComposedDialogExample() {
  return (
    <DialogRoot>
      <DialogTrigger render={<Button />}>프로필 편집</DialogTrigger>
      <DialogContent closeLabel="프로필 편집 닫기">
        <DialogHeader className="pr-12">
          <DialogTitle>프로필 편집</DialogTitle>
          <DialogDescription>조합 API로 제목, 본문, 버튼의 배치를 직접 구성해요.</DialogDescription>
        </DialogHeader>
        <div className="mt-5">
          <TextField label="닉네임" defaultValue="산책하는 고양이" />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>취소</DialogClose>
          <DialogClose render={<Button />}>저장</DialogClose>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
}

const meta = {
  title: 'Overlays/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '앱이 열림 상태를 관리하는 대화상자입니다. 버튼으로 열어 포커스 이동과 Esc, 배경 클릭, 닫기 동작을 확인할 수 있습니다.',
      },
    },
  },
  args: {
    open: false,
    onOpenChange: fn(),
    title: '프로필 설정',
    description: '다른 사람에게 표시할 이름을 입력해 주세요.',
    dismissible: true,
    closeLabel: '닫기',
    placement: 'center',
    children: <TextField label="닉네임" defaultValue="산책하는 고양이" />,
  },
  argTypes: {
    open: { control: false, description: '이 예시에서는 열기 버튼과 내부 상태로 제어합니다.' },
    onOpenChange: { control: false },
    onOpenChangeComplete: { control: false },
    title: { control: 'text' },
    description: { control: 'text' },
    dismissible: { control: 'boolean' },
    closeLabel: { control: 'text' },
    placement: { control: 'inline-radio', options: ['center', 'bottom'] },
    children: { control: false },
    container: { control: false },
    className: { control: false },
  },
  render: (args) => <DialogExample {...args} />,
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Center: Story = { name: '가운데 대화상자' };

export const BottomSheet: Story = {
  name: '하단 시트',
  args: {
    placement: 'bottom',
    title: '알림 설정',
    description: '작은 화면에서도 하단에서 설정을 확인할 수 있어요.',
    children: <p className="text-body text-muted">알림은 언제든 설정에서 변경할 수 있어요.</p>,
  },
};

export const RequiredConfirmation: Story = {
  name: '필수 확인',
  args: {
    title: '변경 사항 확인',
    description: '계속하기 전에 안내를 확인해 주세요.',
    dismissible: false,
    children: <p className="text-body text-muted">이 대화상자는 확인 버튼으로만 닫을 수 있어요.</p>,
  },
  parameters: {
    docs: {
      description: {
        story: 'dismissible=false이면 닫기 버튼이 사라지고 Esc와 배경 클릭으로 닫히지 않습니다.',
      },
    },
  },
};

export const Composition: Story = {
  name: '조합 API',
  render: () => <ComposedDialogExample />,
  parameters: { controls: { disable: true } },
};
