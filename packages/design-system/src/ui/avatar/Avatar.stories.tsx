import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './Avatar';

const avatarImage = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="#fff3e8"/><circle cx="64" cy="48" r="24" fill="#ff9b42"/><path d="M16 128a48 48 0 0 1 96 0" fill="#995014"/></svg>',
)}`;

const meta = {
  title: 'Data display/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  args: { name: '김사이드', size: 'md', shape: 'circle', tone: 'brand' },
  argTypes: {
    name: { control: 'text' },
    src: { control: 'text' },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    shape: { control: 'select', options: ['circle', 'square'] },
    tone: { control: 'select', options: ['brand', 'accent', 'outline'] },
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
export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex items-center gap-2">
        <Avatar {...args} tone="brand" />
        <span className="text-caption">brand</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar {...args} tone="accent" />
        <span className="text-caption">accent</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar {...args} tone="outline" />
        <span className="text-caption">outline</span>
      </div>
    </div>
  ),
};
/** 사람은 원, 그룹처럼 사람이 아닌 대상은 둥근 사각형이다. 작은 사각형은 모서리를 줄여 원과 구분한다. */
export const Shapes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex items-center gap-2">
        <Avatar {...args} shape="circle" tone="accent" size="sm" />
        <Avatar {...args} shape="circle" tone="accent" size="lg" />
        <span className="text-caption">사람</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar {...args} name="우리 웃음" shape="square" tone="outline" size="sm" />
        <Avatar {...args} name="우리 웃음" shape="square" tone="outline" size="lg" />
        <span className="text-caption">그룹</span>
      </div>
    </div>
  ),
};
export const EmptyName: Story = { args: { name: '' } };
