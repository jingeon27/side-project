import type { Meta, StoryObj } from '@storybook/react-vite';

import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from './NativeSelect';

const meta = {
  title: 'Forms/NativeSelect',
  component: NativeSelect,
  tags: ['autodocs'],
  args: {
    'aria-label': '관심 분야',
    defaultValue: 'design',
    size: 'default',
    disabled: false,
  },
  argTypes: {
    size: { control: 'select', options: ['default', 'sm'] },
    'aria-invalid': { control: 'boolean' },
    children: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
  render: (args) => (
    <NativeSelect {...args}>
      <NativeSelectOption value="design">디자인</NativeSelectOption>
      <NativeSelectOption value="development">개발</NativeSelectOption>
      <NativeSelectOption value="planning">기획</NativeSelectOption>
    </NativeSelect>
  ),
} satisfies Meta<typeof NativeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const Disabled: Story = { args: { disabled: true } };
export const GroupedOptions: Story = {
  render: (args) => (
    <NativeSelect {...args}>
      <NativeSelectOptGroup label="만들기">
        <NativeSelectOption value="design">디자인</NativeSelectOption>
        <NativeSelectOption value="development">개발</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="운영하기">
        <NativeSelectOption value="planning">기획</NativeSelectOption>
        <NativeSelectOption value="marketing" disabled>
          마케팅 (준비 중)
        </NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  ),
};
