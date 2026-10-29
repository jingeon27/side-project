import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from '../button/Button';
import { TextAreaField, TextField } from '../text-field/TextField';
import { BottomSheet, type IBottomSheetProps } from './BottomSheet';

function SheetExample(args: IBottomSheetProps) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    args.onOpenChange(nextOpen);
  }

  return (
    <>
      <Button onClick={() => handleOpenChange(true)}>시트 열기</Button>
      <BottomSheet
        {...args}
        open={open}
        onOpenChange={handleOpenChange}
        footer={
          <>
            <Button variant="secondary" onClick={() => handleOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" form="story-profile-form">
              저장
            </Button>
          </>
        }
      >
        <form
          id="story-profile-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleOpenChange(false);
          }}
        >
          <TextField label="닉네임" defaultValue="산책하는 고양이" required />
          <TextAreaField label="소개" description="프로필에 보여 줄 짧은 소개예요." />
        </form>
      </BottomSheet>
    </>
  );
}

/** Photo Contest 댓글 시트처럼 75% 높이로 열고 슬롯 여백을 바꾸는 조합 예시 */
function CompositionExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>댓글 보기</Button>
      <BottomSheet.Root open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)} snapPoints={[0.75, 1]}>
        <BottomSheet.Handle label="시트 높이 조절" />
        <BottomSheet.Header title="댓글 3개" description="최신순으로 보여요."></BottomSheet.Header>
        <BottomSheet.Content className="px-5">
          <ul className="flex flex-col gap-3 text-body">
            <li>노을이 정말 예뻐요.</li>
            <li>어디서 찍었는지 궁금해요.</li>
            <li>다음 대회도 기대할게요.</li>
          </ul>
        </BottomSheet.Content>
        <BottomSheet.Footer className="px-5">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            닫기
          </Button>
        </BottomSheet.Footer>
      </BottomSheet.Root>
    </>
  );
}

const meta = {
  title: 'Overlays/BottomSheet',
  component: BottomSheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '아래에서 올라오는 입력 시트입니다. 손잡이를 끌거나 방향키로 높이를 바꾸고 아래로 밀어 닫습니다. 배치를 바꾸려면 BottomSheet.Root·Handle·Header·Close·Content·Footer를 조합합니다.',
      },
    },
  },
  args: {
    open: false,
    onOpenChange: fn(),
    title: '프로필 수정',
    description: '다른 사람에게 보여 줄 정보를 고쳐요.',
    children: null,
    dismissible: true,
    responsive: false,
    showCloseButton: false,
    closeLabel: '닫기',
    resizeLabel: '시트 높이 조절',
  },
  argTypes: {
    open: { control: false, description: '이 예시에서는 열기 버튼과 내부 상태로 제어합니다.' },
    onOpenChange: { control: false },
    onOpenChangeComplete: { control: false },
    onSnapPointChange: { control: false },
    title: { control: 'text' },
    description: { control: 'text' },
    children: { control: false },
    footer: { control: false },
    container: { control: false },
    className: { control: false },
    snapPoints: { control: false },
    snapPoint: { control: false },
  },
  render: (args) => <SheetExample {...args} />,
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: '입력 시트' };

export const Responsive: Story = {
  name: '반응형(768px부터 중앙)',
  args: { responsive: true, showCloseButton: false },
};

export const Composition: Story = {
  name: '조합 API',
  render: () => <CompositionExample />,
  parameters: { controls: { disable: true } },
};
