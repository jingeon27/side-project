import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

it('포커스할 내용이 없는 패널도 Tab으로 들어가면 포커스 링이 보여야 한다', async () => {
  const user = userEvent.setup();
  render(
    <Tabs defaultValue="latest">
      <TabsList aria-label="피드 분류">
        <TabsTrigger value="latest">최신 글</TabsTrigger>
      </TabsList>
      <TabsContent value="latest">전체 글 목록</TabsContent>
    </Tabs>,
  );
  await user.tab();
  expect(screen.getByRole('tab', { name: '최신 글' })).toHaveFocus();
  await user.tab();
  const panel = screen.getByRole('tabpanel', { name: '최신 글' });
  expect(panel).toHaveFocus();
  // 패널은 전역 :focus-visible outline을 그대로 쓴다(outline-none·ring으로 바꾸면 forced-colors에서 사라진다).
  expect(panel.className).not.toMatch(/outline-(none|hidden)|focus-visible:ring/);
});
