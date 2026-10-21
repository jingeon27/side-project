import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextField } from './TextField';

const meta = {
  title: 'Forms/TextField',
  component: TextField,
  tags: ['autodocs'],
  args: {
    label: '닉네임',
    placeholder: '닉네임을 입력해 주세요',
    description: '다른 사람에게 보여 줄 이름이에요.',
    disabled: false,
    required: false,
  },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    error: { control: 'text' },
    type: { control: 'select', options: ['text', 'email', 'password', 'search', 'tel', 'url'] },
    labelSuffix: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithError: Story = {
  args: { defaultValue: 'a', error: '닉네임은 두 글자 이상 입력해 주세요.' },
};
export const Required: Story = {
  args: { required: true, labelSuffix: <span className="text-caption text-danger">필수</span> },
};
export const Disabled: Story = { args: { disabled: true, defaultValue: '피드백 메이커' } };
