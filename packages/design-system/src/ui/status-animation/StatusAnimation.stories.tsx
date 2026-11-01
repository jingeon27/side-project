import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusAnimation } from './StatusAnimation';

const meta = {
  title: 'Feedback/StatusAnimation',
  component: StatusAnimation,
  tags: ['autodocs'],
  args: { variant: 'empty', label: '아직 등록한 내용이 없어요', className: 'size-24' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['loading', 'empty', 'success', 'error', 'offline', 'game', 'cat'],
    },
  },
} satisfies Meta<typeof StatusAnimation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Loading: Story = { args: { variant: 'loading', label: '불러오는 중' } };
export const Success: Story = { args: { variant: 'success', label: '저장했어요' } };
export const Error: Story = { args: { variant: 'error', label: '다시 시도해 주세요' } };
export const Offline: Story = { args: { variant: 'offline', label: '연결을 확인해 주세요' } };
export const Game: Story = { args: { variant: 'game', label: 'Game Mate' } };
export const Cat: Story = {
  args: { variant: 'cat', label: '소파에 누운 고양이', className: 'aspect-5/4 h-auto w-80' },
};
