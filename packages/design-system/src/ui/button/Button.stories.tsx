import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, Send } from 'lucide-react';
import { fn } from 'storybook/test';

import { Button } from './Button';

const meta = {
  title: 'Actions/Button',
  component: Button,
  tags: ['autodocs'],
  args: {
    children: '저장하기',
    variant: 'primary',
    loading: false,
    disabled: false,
    fullWidth: false,
    onClick: fn(),
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'ghost',
        'danger',
        'accent',
        'default',
        'outline',
        'destructive',
        'link',
      ],
    },
    size: { control: 'select', options: ['lg', 'md', 'sm', 'default', 'icon', 'icon-sm', 'icon-lg'] },
    children: { control: 'text' },
    icon: { control: false },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="primary">
        저장하기
      </Button>
      <Button {...args} variant="secondary">
        취소
      </Button>
      <Button {...args} variant="ghost">
        더 보기
      </Button>
      <Button {...args} variant="danger">
        삭제하기
      </Button>
      <Button {...args} variant="accent">
        시작하기
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="lg">
        큰 버튼
      </Button>
      <Button {...args} size="md">
        기본 버튼
      </Button>
      <Button {...args} size="sm">
        작은 버튼
      </Button>
    </div>
  ),
};

export const Loading: Story = { args: { children: '저장 중', loading: true } };
export const Disabled: Story = { args: { disabled: true } };
export const WithIcon: Story = { args: { icon: <Plus aria-hidden="true" />, children: '새 글 작성' } };
/** 진행 중에는 앞 아이콘 자리에 진행 표시가 들어간다. */
export const LoadingWithIcon: Story = {
  args: { variant: 'secondary', icon: <Send aria-hidden="true" />, children: '보내는 중', loading: true },
};
export const FullWidth: Story = { args: { fullWidth: true } };
