import type { Meta, StoryObj } from '@storybook/react-vite';

import { Textarea } from './Textarea';

const meta = {
  title: 'Forms/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  args: {
    'aria-label': '피드백',
    placeholder: '좋았던 점과 개선할 점을 남겨 주세요',
    rows: 4,
    disabled: false,
  },
  argTypes: {
    rows: { control: { type: 'number', min: 2, max: 10 } },
    'aria-invalid': { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Invalid: Story = { args: { 'aria-invalid': true } };
export const Disabled: Story = { args: { disabled: true, defaultValue: '작성한 피드백을 확인하고 있어요.' } };
