import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Heart, Plus, Share2 } from 'lucide-react';
import { fn } from 'storybook/test';

import { IconButton } from './IconButton';

const meta = {
  title: 'Actions/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  args: {
    label: '알림 열기',
    variant: 'ghost',
    children: <Bell aria-hidden="true" />,
    disabled: false,
    onClick: fn(),
  },
  argTypes: {
    label: { control: 'text' },
    variant: { control: 'select', options: ['ghost', 'soft', 'primary', 'accent'] },
    children: { control: false },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Variants: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <IconButton {...args} variant="ghost" label="알림 열기">
        <Bell aria-hidden="true" />
      </IconButton>
      <IconButton {...args} variant="soft" label="좋아요">
        <Heart aria-hidden="true" />
      </IconButton>
      <IconButton {...args} variant="primary" label="추가하기">
        <Plus aria-hidden="true" />
      </IconButton>
      <IconButton {...args} variant="accent" label="공유하기">
        <Share2 aria-hidden="true" />
      </IconButton>
    </div>
  ),
};
export const Disabled: Story = { args: { disabled: true } };
/** 진행 중에는 아이콘 자리에 진행 표시가 들어가고 포커스는 남는다. */
export const Loading: Story = { args: { loading: true, variant: 'soft' } };
