import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  args: { defaultValue: 'latest', orientation: 'horizontal' },
  argTypes: {
    orientation: { control: 'select', options: ['horizontal', 'vertical'] },
    value: { control: false },
    children: { control: false },
  },
  render: (args) => (
    <Tabs {...args}>
      <TabsList aria-label="피드 분류">
        <TabsTrigger value="latest">최신 글</TabsTrigger>
        <TabsTrigger value="unanswered">답변 대기</TabsTrigger>
        <TabsTrigger value="saved" disabled>
          저장한 글
        </TabsTrigger>
      </TabsList>
      <TabsContent value="latest" className="p-4">
        새로 올라온 프로젝트를 만나 보세요.
      </TabsContent>
      <TabsContent value="unanswered" className="p-4">
        첫 피드백을 기다리고 있어요.
      </TabsContent>
      <TabsContent value="saved" className="p-4">
        저장한 프로젝트예요.
      </TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Vertical: Story = { args: { orientation: 'vertical' } };
export const Line: Story = {
  render: (args) => (
    <Tabs {...args}>
      <TabsList variant="line" aria-label="피드 분류">
        <TabsTrigger value="latest">최신 글</TabsTrigger>
        <TabsTrigger value="unanswered">답변 대기</TabsTrigger>
      </TabsList>
      <TabsContent value="latest" className="p-4">
        새로 올라온 프로젝트를 만나 보세요.
      </TabsContent>
      <TabsContent value="unanswered" className="p-4">
        첫 피드백을 기다리고 있어요.
      </TabsContent>
    </Tabs>
  ),
};
