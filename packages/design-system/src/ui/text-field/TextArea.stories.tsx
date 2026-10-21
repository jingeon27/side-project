import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextArea } from './TextField';

const meta = {
  title: 'Forms/TextAreaField',
  component: TextArea,
  tags: ['autodocs'],
  args: {
    label: '소개',
    placeholder: '어떤 프로젝트를 만들고 있나요?',
    description: '프로젝트를 짧게 소개해 주세요.',
    rows: 4,
    disabled: false,
  },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    error: { control: 'text' },
    rows: { control: { type: 'number', min: 2, max: 10 } },
    labelSuffix: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithError: Story = { args: { error: '소개를 입력해 주세요.' } };
export const Disabled: Story = {
  args: { disabled: true, defaultValue: '작은 아이디어를 함께 발전시키는 공간을 만들고 있어요.' },
};
