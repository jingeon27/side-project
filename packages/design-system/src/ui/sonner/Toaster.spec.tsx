import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, expect, it } from 'vitest';

import { Toaster } from './Toaster';

afterEach(() => {
  act(() => toast.dismiss());
});

it('알림을 공통 토큰과 앱이 넘긴 테마·번역으로 보여 줘야 한다', async () => {
  render(<Toaster theme="dark" position="top-center" containerAriaLabel="알림" />);
  act(() => {
    toast.success('게시글을 등록했어요.');
  });

  const message = await screen.findByText('게시글을 등록했어요.');
  const list = screen
    .getByRole('region', { name: /알림/ })
    .querySelector<HTMLElement>('[data-sonner-toaster]')!;
  expect(list).toHaveAttribute('data-sonner-theme', 'dark');
  expect(list.style.getPropertyValue('--normal-bg')).toBe('var(--color-surface)');
  expect(list.style.zIndex).toBe('var(--z-index-toast)');
  expect(message.closest('[data-sonner-toast]')).toHaveAttribute('data-type', 'success');
});

it('닫기 버튼은 44px 조작 영역으로 알림을 닫아야 한다', async () => {
  render(<Toaster closeButton />);
  act(() => {
    toast('임시 저장했어요.');
  });

  await screen.findByText('임시 저장했어요.');
  const close = screen.getByRole('button', { name: /close/i });
  expect(close).toHaveClass('size-touch!');
  // Sonner의 스와이프 처리가 jsdom에 없는 setPointerCapture를 부르므로 포인터 없이 클릭한다.
  fireEvent.click(close);
  await waitFor(() => expect(screen.queryByText('임시 저장했어요.')).not.toBeInTheDocument());
});
