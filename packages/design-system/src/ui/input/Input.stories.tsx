import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { FormField } from '../form-field/FormField';
import { NativeSelect, NativeSelectOption } from '../native-select/NativeSelect';
import { Textarea } from '../textarea/Textarea';
import { Input } from './Input';

const meta = {
  title: 'Forms/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    'aria-label': '이메일',
    type: 'email',
    placeholder: 'hello@example.com',
    disabled: false,
  },
  argTypes: {
    type: { control: 'select', options: ['text', 'email', 'password', 'search', 'tel', 'url'] },
    'aria-invalid': { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'hello' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'hello@example.com' } };

function NativeFormExample() {
  const [submittedName, setSubmittedName] = useState('');

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setSubmittedName(String(data.get('nickname') ?? ''));
      }}
    >
      <FormField label="닉네임">
        <Input name="nickname" placeholder="피드백 메이커" required />
      </FormField>
      <FormField label="관심 분야">
        <NativeSelect name="category" defaultValue="design">
          <NativeSelectOption value="design">디자인</NativeSelectOption>
          <NativeSelectOption value="development">개발</NativeSelectOption>
          <NativeSelectOption value="planning">기획</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField label="소개">
        <Textarea name="introduction" placeholder="짧게 소개해 주세요" rows={3} />
      </FormField>
      <Button type="submit">프로필 저장</Button>
      <p role="status" className="text-caption text-muted">
        {submittedName ? `${submittedName}님의 프로필을 저장했어요.` : '입력 후 저장 버튼을 눌러 보세요.'}
      </p>
    </form>
  );
}

export const NativeForm: Story = {
  parameters: { controls: { disable: true } },
  render: () => <NativeFormExample />,
};
