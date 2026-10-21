import { useId, type ComponentProps } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { toast } from 'sonner';

import { Button } from '../button/Button';
import { Toaster } from './Toaster';

function ToasterExample(args: ComponentProps<typeof Toaster>) {
  const toasterId = useId();

  function showProgress() {
    const request = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1200);
    });

    toast.promise(request, {
      toasterId,
      loading: '변경 사항을 저장하고 있어요.',
      success: '변경 사항을 저장했어요.',
      error: '저장하지 못했어요.',
    });
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => toast('새 알림이 도착했어요.', { toasterId })}>
          기본
        </Button>
        <Button variant="secondary" onClick={() => toast.success('프로필을 저장했어요.', { toasterId })}>
          성공
        </Button>
        <Button variant="secondary" onClick={() => toast.info('새 버전이 준비됐어요.', { toasterId })}>
          안내
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.warning('저장 공간이 얼마 남지 않았어요.', { toasterId })}
        >
          경고
        </Button>
        <Button
          variant="secondary"
          onClick={() => toast.error('네트워크 연결을 확인해 주세요.', { toasterId })}
        >
          오류
        </Button>
        <Button variant="secondary" onClick={showProgress}>
          저장 진행 상태
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast('항목을 보관했어요.', {
              toasterId,
              action: {
                label: '되돌리기',
                onClick: () => toast.success('보관을 취소했어요.', { toasterId }),
              },
            })
          }
        >
          되돌리기 동작
        </Button>
      </div>
      <p className="text-body text-muted">
        버튼을 눌러 실제 알림을 표시해 보세요. Controls에서 알림의 테마와 위치를 바꿀 수 있어요.
      </p>
      <Toaster {...args} id={toasterId} />
    </div>
  );
}

const meta = {
  title: 'Feedback/Toaster',
  component: Toaster,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Sonner 알림에 공통 색상, 아이콘, 타이포그래피를 적용합니다. 앱에 Toaster를 배치한 후 sonner의 toast 함수를 호출합니다.',
      },
    },
  },
  args: {
    theme: 'system',
    position: 'bottom-right',
    closeButton: true,
    richColors: false,
    expand: false,
    duration: 4000,
    visibleToasts: 3,
  },
  argTypes: {
    theme: { control: 'inline-radio', options: ['system', 'light', 'dark'] },
    position: {
      control: 'select',
      options: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'],
    },
    closeButton: { control: 'boolean' },
    richColors: { control: 'boolean' },
    expand: { control: 'boolean' },
    duration: { control: { type: 'number', min: 1000, max: 10000, step: 500 } },
    visibleToasts: { control: { type: 'number', min: 1, max: 5, step: 1 } },
    id: { control: false },
    icons: { control: false },
    toastOptions: { control: false },
    style: { control: false },
    className: { control: false },
  },
  render: (args) => <ToasterExample {...args} />,
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Notifications: Story = { name: '알림 종류와 동작' };

export const BottomCenter: Story = {
  name: '하단 가운데',
  args: { position: 'bottom-center', expand: true },
};
