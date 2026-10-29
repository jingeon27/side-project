import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './Avatar';

const avatarImage = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#fff3e8"/><circle cx="64" cy="48" r="24" fill="#ff9b42"/><path d="M16 128a48 48 0 0 1 96 0" fill="#995014"/></svg>',
)}`;

const meta = {
  title: 'Data display/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  args: { name: '김사이드', size: 'md' },
  argTypes: {
    name: { control: 'text' },
    src: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Avatar {...args} />
      <span className="text-body">{args.name || '이름 없음'}</span>
    </div>
  ),
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {};
export const WithImage: Story = { args: { src: avatarImage } };
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex items-center gap-2">
        <Avatar {...args} size="sm" />
        <span className="text-caption">작게</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar {...args} size="md" />
        <span className="text-caption">기본</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar {...args} size="lg" />
        <span className="text-caption">크게</span>
      </div>
    </div>
  ),
};
export const EmptyName: Story = { args: { name: '' } };
