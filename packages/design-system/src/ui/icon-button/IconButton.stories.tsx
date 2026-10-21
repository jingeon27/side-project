import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Heart, Plus } from 'lucide-react';
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
    variant: { control: 'select', options: ['ghost', 'soft', 'brand'] },
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
      <IconButton {...args} variant="brand" label="추가하기">
        <Plus aria-hidden="true" />
      </IconButton>
    </div>
  ),
};
export const Disabled: Story = { args: { disabled: true } };
