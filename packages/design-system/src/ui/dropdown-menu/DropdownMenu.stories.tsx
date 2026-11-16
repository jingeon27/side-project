import { useState, type ComponentProps } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Download, Pencil, Trash2 } from 'lucide-react';

import { Button } from '../button/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

type TDropdownMenuStoryArgs = ComponentProps<typeof DropdownMenu> &
  Pick<ComponentProps<typeof DropdownMenuContent>, 'align' | 'side' | 'sideOffset'>;

function DropdownMenuExample({ align, side, sideOffset, ...args }: TDropdownMenuStoryArgs) {
  const [lastAction, setLastAction] = useState('아직 선택한 작업이 없어요.');

  return (
    <div className="flex min-h-64 w-80 flex-col items-start gap-4">
      <DropdownMenu {...args}>
        <DropdownMenuTrigger render={<Button variant="secondary" />}>문서 작업</DropdownMenuTrigger>
        <DropdownMenuContent align={align} side={side} sideOffset={sideOffset}>
          <DropdownMenuItem onClick={() => setLastAction('이름 바꾸기를 선택했어요.')}>
            <Pencil aria-hidden="true" />
            이름 바꾸기
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLastAction('사본 만들기를 선택했어요.')}>
            <Copy aria-hidden="true" />
            사본 만들기
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Download aria-hidden="true" />
            다운로드 준비 중
          </DropdownMenuItem>
          <DropdownMenuItem variant="danger" onClick={() => setLastAction('삭제를 선택했어요.')}>
            <Trash2 aria-hidden="true" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role="status" className="text-body text-muted">
        {lastAction}
      </p>
      <p className="text-caption text-muted">
        Enter로 열고 방향키로 이동해 보세요. Esc를 누르면 메뉴가 닫혀요.
      </p>
    </div>
  );
}

const FORMAT_ITEMS = Array.from({ length: 12 }, (_, index) => `서식 ${index + 1}`);

function LongDropdownMenuExample({ align, side, sideOffset, ...args }: TDropdownMenuStoryArgs) {
  const [selected, setSelected] = useState('');

  return (
    <div className="flex flex-col items-start gap-4">
      <DropdownMenu {...args}>
        <DropdownMenuTrigger render={<Button variant="secondary" />}>서식 메뉴</DropdownMenuTrigger>
        <DropdownMenuContent align={align} side={side} sideOffset={sideOffset}>
          {FORMAT_ITEMS.map((name) => (
            <DropdownMenuItem key={name} onClick={() => setSelected(name)}>
              {name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <output aria-label="고른 항목" className="text-body text-muted">
        {selected}
      </output>
    </div>
  );
}

const meta = {
  title: 'Overlays/DropdownMenu',
  component: DropdownMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '트리거, 포털 콘텐츠, 항목을 조합하는 작업 메뉴입니다. 선택 결과, 비활성 항목, 삭제 항목과 키보드 탐색을 확인할 수 있습니다.',
      },
    },
  },
  args: {
    align: 'start',
    side: 'bottom',
    sideOffset: 4,
    loopFocus: true,
    modal: true,
  },
  argTypes: {
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    side: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
    sideOffset: { control: { type: 'number', min: 0, max: 32, step: 1 } },
    loopFocus: { control: 'boolean' },
    modal: { control: 'boolean' },
    open: { control: false },
    defaultOpen: { control: false },
    children: { control: false },
    onOpenChange: { control: false },
    onOpenChangeComplete: { control: false },
    onItemHighlighted: { control: false },
    actionsRef: { control: false },
    handle: { control: false },
  },
  render: (args) => <DropdownMenuExample {...args} />,
} satisfies Meta<TDropdownMenuStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Actions: Story = { name: '작업 선택' };

export const SidePlacement: Story = {
  name: '오른쪽에 표시',
  args: { side: 'right', sideOffset: 8 },
};

export const LongList: Story = {
  name: '긴 목록',
  render: (args) => <LongDropdownMenuExample {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          '화면 높이가 부족하면 남은 높이 안에서 메뉴를 스크롤합니다. `DropdownMenu.browser.spec.ts`가 이 스토리를 엽니다.',
      },
    },
  },
};
