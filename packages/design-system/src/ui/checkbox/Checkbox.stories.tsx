import type { Meta, StoryObj } from '@storybook/react-vite';

import { Checkbox } from './Checkbox';

const meta = {
  title: 'Forms/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: { disabled: false, defaultChecked: false, indeterminate: false },
  argTypes: {
    checked: { control: false },
    defaultChecked: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
  },
  render: (args) => (
    <label className="inline-flex min-h-touch cursor-pointer items-center gap-3 text-body">
      <Checkbox {...args} />새 댓글 알림 받기
    </label>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Indeterminate: Story = { args: { indeterminate: true } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };
