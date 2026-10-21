import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './Badge';

const meta = {
  title: 'Data display/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: '진행 중', tone: 'neutral' },
  argTypes: {
    children: { control: 'text' },
    tone: {
      control: 'select',
      options: ['brand', 'accent', 'neutral', 'danger', 'info', 'gold', 'silver', 'bronze'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone="brand">운영팀</Badge>
      <Badge tone="accent">추천</Badge>
      <Badge tone="neutral">진행 중</Badge>
      <Badge tone="danger">마감</Badge>
      <Badge tone="info">안내</Badge>
      <Badge tone="gold">1위</Badge>
      <Badge tone="silver">2위</Badge>
      <Badge tone="bronze">3위</Badge>
    </div>
  ),
};
