import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function FeedTabs({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  const [value, setValue] = useState<unknown>('latest');
  return (
    <Tabs orientation={orientation} value={value} onValueChange={setValue}>
      <TabsList aria-label="피드 분류">
        <TabsTrigger value="latest">최신 글</TabsTrigger>
        <TabsTrigger value="unanswered">답변 대기</TabsTrigger>
      </TabsList>
      <TabsContent value="latest">전체 글 목록</TabsContent>
      <TabsContent value="unanswered">피드백 요청 목록</TabsContent>
    </Tabs>
  );
}
it.each(['horizontal', 'vertical'] as const)(
  '%s 탭을 방향키로 이동하고 선택 패널과 ARIA 상태를 변경해야 한다',
  async (orientation) => {
    const user = userEvent.setup();
    render(<FeedTabs orientation={orientation} />);
    const latest = screen.getByRole('tab', { name: '최신 글' });
    await user.click(latest);
    await user.keyboard(orientation === 'horizontal' ? '{ArrowRight}{Enter}' : '{ArrowDown}{Enter}');
    const unanswered = screen.getByRole('tab', { name: '답변 대기' });
    expect(unanswered).toHaveFocus();
    expect(unanswered).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '답변 대기' })).toHaveTextContent('피드백 요청 목록');
  },
);
