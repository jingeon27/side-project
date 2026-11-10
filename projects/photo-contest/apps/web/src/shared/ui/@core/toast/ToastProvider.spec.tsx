import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toast } from '../../../model/toast';
import { ToastProvider } from './ToastProvider';

afterEach(() => {
  vi.useRealTimers();
  act(() => toast.close());
});

describe('ToastProvider', () => {
  it('화면 밖에서 띄운 알림을 보여 주고 닫기 버튼으로 닫을 수 있어야 한다', async () => {
    const user = userEvent.setup();
    render(<ToastProvider>화면</ToastProvider>);

    act(() => {
      toast.success('초대 링크를 복사했어요');
    });
    const region = await screen.findByRole('region', { name: '알림' });
    expect(await within(region).findByText('초대 링크를 복사했어요')).toBeInTheDocument();

    // 닫기 버튼은 알림 영역에 들어오기(F6) 전까지 보조기기에서 숨겨져 있어 레이블로 찾는다.
    await user.click(within(region).getByLabelText('알림 닫기'));
    await waitFor(() => expect(within(region).queryByText('초대 링크를 복사했어요')).not.toBeInTheDocument());
  });

  it('같은 오류가 연달아 나도 알림을 하나만 보여 줘야 한다', async () => {
    render(<ToastProvider>화면</ToastProvider>);
    act(() => {
      toast.error('네트워크 연결을 확인하고 다시 시도해 주세요.');
      toast.error('네트워크 연결을 확인하고 다시 시도해 주세요.');
    });
    const region = await screen.findByRole('region', { name: '알림' });
    await within(region).findByText('네트워크 연결을 확인하고 다시 시도해 주세요.');
    expect(within(region).getAllByText('네트워크 연결을 확인하고 다시 시도해 주세요.')).toHaveLength(1);
  });

  it('휴대폰 열(#pc-main)이 있으면 그 안에 띄워야 한다', async () => {
    const main = document.body.appendChild(document.createElement('main'));
    main.id = 'pc-main';
    render(<ToastProvider>화면</ToastProvider>);
    act(() => {
      toast.info('투표가 시작됐어요');
    });
    expect(main).toContainElement(
      await within(await screen.findByRole('region', { name: '알림' })).findByText('투표가 시작됐어요'),
    );
    main.remove();
  });

  it('성공·안내 알림은 알림 영역이 차례로 읽고, 제목·설명을 알림의 이름·설명으로 이어야 한다', async () => {
    render(<ToastProvider>화면</ToastProvider>);
    act(() => {
      toast.success('초대 링크를 복사했어요', { description: '받는 사람이 링크로 바로 가입할 수 있어요.' });
    });

    const region = await screen.findByRole('region', { name: '알림' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    const item = await within(region).findByRole('dialog', { name: '초대 링크를 복사했어요' });
    expect(item).toHaveAccessibleDescription('받는 사람이 링크로 바로 가입할 수 있어요.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('오류 알림은 하던 말을 끊고(alert) 한 번만 읽어야 하고, 닫으면 읽을 내용도 지워야 한다', async () => {
    const user = userEvent.setup();
    render(<ToastProvider>화면</ToastProvider>);
    act(() => {
      toast.error('사진을 올리지 못했어요', { description: '네트워크 연결을 확인해 주세요.' });
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('사진을 올리지 못했어요');
    expect(alert).toHaveTextContent('네트워크 연결을 확인해 주세요.');
    // 화면의 알림은 F6으로 들어오기 전까지 숨겨 같은 내용을 두 번 읽지 않는다.
    const region = screen.getByRole('region', { name: '알림' });
    expect(within(region).queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(within(region).getByRole('alertdialog', { hidden: true })).toHaveAttribute('aria-hidden', 'true');

    await user.click(within(region).getByLabelText('알림 닫기'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it.each([
    { path: 'Escape', dismiss: ['{Escape}'] },
    { path: '닫기 버튼', dismiss: ['{Tab}', '{Enter}'] },
  ])('F6으로 알림에 들어가 닫으면($path) 누르던 버튼으로 포커스가 돌아가야 한다', async ({ dismiss }) => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <button type="button" onClick={() => toast.success('초대 링크를 복사했어요')}>
          링크 복사
        </button>
      </ToastProvider>,
    );
    const trigger = screen.getByRole('button', { name: '링크 복사' });
    await user.click(trigger);
    const region = await screen.findByRole('region', { name: '알림' });
    await within(region).findByText('초대 링크를 복사했어요');
    expect(within(region).queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();

    await user.keyboard('{F6}');
    expect(region).toHaveFocus();
    // 알림 영역에 들어오면 닫기 버튼도 보조기기에 드러난다.
    expect(within(region).getByRole('button', { name: '알림 닫기' })).toBeInTheDocument();
    await user.tab();
    expect(within(region).getByRole('dialog', { name: '초대 링크를 복사했어요' })).toHaveFocus();

    for (const key of dismiss) await user.keyboard(key);
    await waitFor(() => expect(within(region).queryByText('초대 링크를 복사했어요')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('4초가 지나면 저절로 닫히되, F6으로 알림 영역에 머무는 동안에는 기다려야 한다', async () => {
    render(
      <ToastProvider>
        <button type="button">링크 복사</button>
      </ToastProvider>,
    );
    const region = await screen.findByRole('region', { name: '알림' });
    const trigger = screen.getByRole('button', { name: '링크 복사' });
    vi.useFakeTimers();

    act(() => {
      toast.info('투표가 시작됐어요');
    });
    act(() => vi.advanceTimersByTime(3_999));
    expect(within(region).getByText('투표가 시작됐어요')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(within(region).queryByText('투표가 시작됐어요')).not.toBeInTheDocument();

    act(() => {
      toast.info('투표가 끝났어요');
    });
    act(() => trigger.focus());
    act(() => vi.advanceTimersByTime(1_000));
    // 가짜 타이머에서는 userEvent가 끝나지 않아 키 입력을 fireEvent로 보낸다.
    fireEvent.keyDown(trigger, { key: 'F6' });
    expect(region).toHaveFocus();
    act(() => vi.advanceTimersByTime(10_000));
    expect(within(region).getByText('투표가 끝났어요')).toBeInTheDocument();

    // Shift+Tab으로 나가면 남은 3초부터 다시 센다.
    fireEvent.keyDown(region, { key: 'Tab', shiftKey: true });
    expect(trigger).toHaveFocus();
    act(() => vi.advanceTimersByTime(2_999));
    expect(within(region).getByText('투표가 끝났어요')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(within(region).queryByText('투표가 끝났어요')).not.toBeInTheDocument();
  });
});
