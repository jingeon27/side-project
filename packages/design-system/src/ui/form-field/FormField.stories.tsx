import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from '../input/Input';
import { NativeSelect, NativeSelectOption } from '../native-select/NativeSelect';
import { Textarea } from '../textarea/Textarea';
import { FormField } from './FormField';

const meta = {
  title: 'Forms/FormField',
  component: FormField,
  tags: ['autodocs'],
  args: {
    label: '이메일',
    description: '답변을 받을 이메일 주소를 입력해 주세요.',
    children: <Input type="email" placeholder="hello@example.com" />,
  },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    error: { control: 'text' },
    children: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithError: Story = {
  args: { error: '이메일 주소를 확인해 주세요.', children: <Input type="email" defaultValue="hello" /> },
};
export const WithTextarea: Story = {
  args: {
    label: '피드백',
    description: '좋았던 점과 개선할 점을 자유롭게 적어 주세요.',
    children: <Textarea placeholder="피드백을 남겨 주세요" rows={4} />,
  },
};
export const WithNativeSelect: Story = {
  args: {
    label: '관심 분야',
    description: '가장 관심 있는 분야를 골라 주세요.',
    children: (
      <NativeSelect defaultValue="design">
        <NativeSelectOption value="design">디자인</NativeSelectOption>
        <NativeSelectOption value="development">개발</NativeSelectOption>
        <NativeSelectOption value="planning">기획</NativeSelectOption>
      </NativeSelect>
    ),
  },
};
