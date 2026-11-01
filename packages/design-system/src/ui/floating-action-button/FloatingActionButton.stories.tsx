import type { Meta, StoryObj } from '@storybook/react-vite';
import { PenLine } from 'lucide-react';
import { fn } from 'storybook/test';

import { FloatingActionButton } from './FloatingActionButton';

const meta = {
  title: 'Actions/FloatingActionButton',
  component: FloatingActionButton,
  tags: ['autodocs'],
  args: {
    label: '그룹 만들기',
    compact: false,
    disabled: false,
    onClick: fn(),
  },
  argTypes: {
    label: { control: 'text' },
    compact: { control: 'boolean' },
    icon: { control: false },
  },
} satisfies Meta<typeof FloatingActionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
/** Tab으로 포커스하면 compact 상태에서도 라벨이 보인다. */
export const Compact: Story = { args: { compact: true } };
export const Languages: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-4">
      <FloatingActionButton {...args} label="새 그룹 만들기" />
      <FloatingActionButton {...args} label="Create a new group" />
      <FloatingActionButton {...args} label="新しいグループを作成" />
    </div>
  ),
};
export const CustomIcon: Story = {
  args: { label: '글쓰기', icon: <PenLine className="size-5" /> },
};
export const Disabled: Story = { args: { disabled: true } };
