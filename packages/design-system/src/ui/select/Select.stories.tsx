import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './Select';

const items = [
  { value: 'design', label: '디자인' },
  { value: 'development', label: '개발' },
  { value: 'planning', label: '기획' },
];

const meta = {
  title: 'Forms/Select',
  component: Select,
  tags: ['autodocs'],
  args: { defaultValue: 'design', disabled: false },
  argTypes: {
    defaultValue: { control: 'select', options: items.map((item) => item.value) },
    value: { control: false },
    children: { control: false },
  },
  render: (args) => (
    <Select {...args} items={items}>
      <SelectTrigger aria-label="관심 분야" className="w-56">
        <SelectValue placeholder="관심 분야 선택" />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const GroupedOptions: Story = {
  render: (args) => (
    <Select {...args} items={items}>
      <SelectTrigger aria-label="관심 분야" className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectLabel>만들기</SelectLabel>
          <SelectItem value="design">디자인</SelectItem>
          <SelectItem value="development">개발</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>운영하기</SelectLabel>
          <SelectItem value="planning" disabled>
            기획 (준비 중)
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};
