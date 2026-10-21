import type { Meta, StoryObj } from '@storybook/react-vite';

import { Spinner } from './Spinner';

const meta = {
  title: 'Feedback/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  args: { label: '불러오는 중' },
  argTypes: {
    label: { control: 'text' },
    className: { control: 'select', options: ['size-4', 'size-5', 'size-8'] },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithMessage: Story = {
  args: { label: undefined },
  render: (args) => (
    <div role="status" className="flex items-center gap-2 text-body text-muted">
      <Spinner {...args} label={undefined} />새 피드백을 불러오고 있어요.
    </div>
  ),
};
