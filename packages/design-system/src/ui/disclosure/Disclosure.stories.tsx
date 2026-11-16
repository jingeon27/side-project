import type { Meta, StoryObj } from '@storybook/react-vite';

import { Disclosure, DisclosureTrigger } from './Disclosure';

const meta = {
  title: 'Data display/Disclosure',
  component: Disclosure,
  tags: ['autodocs'],
  args: { variant: 'card', open: false },
  argTypes: {
    variant: { control: 'select', options: ['plain', 'card', 'soft'] },
    open: { control: 'boolean' },
    children: { control: false },
  },
  render: (args) => (
    <Disclosure {...args} className="max-w-app">
      <DisclosureTrigger>카테고리 관리</DisclosureTrigger>
      <p className="mt-4 text-body text-muted">카테고리 3/20개. 게시물을 쓸 때 선택할 수 있어요.</p>
    </Disclosure>
  ),
} satisfies Meta<typeof Disclosure>;

export default meta;
type TStory = StoryObj<typeof meta>;

export const Card: TStory = {};
export const Open: TStory = { args: { open: true } };
export const Plain: TStory = {
  args: { variant: 'plain' },
  render: (args) => (
    <Disclosure {...args} className="max-w-app border-t border-line pt-3">
      <DisclosureTrigger>
        그룹 사진 추가
        <span aria-hidden="true" className="ml-1 text-micro text-muted">
          선택
        </span>
      </DisclosureTrigger>
      <p className="pt-4 text-body text-muted">배경 사진과 프로필 사진을 고를 수 있어요.</p>
    </Disclosure>
  ),
};
export const Soft: TStory = {
  args: { variant: 'soft' },
  render: (args) => (
    <Disclosure {...args} className="max-w-app text-caption text-ink">
      <DisclosureTrigger>신고 내용 확인</DisclosureTrigger>
      <ul className="flex flex-col gap-2 pb-2">
        <li>동의 없이 올린 사진</li>
        <li>다른 그룹의 사진을 그대로 올렸어요</li>
      </ul>
    </Disclosure>
  ),
};
