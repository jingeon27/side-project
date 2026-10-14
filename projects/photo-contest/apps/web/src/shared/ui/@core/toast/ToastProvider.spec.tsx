import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { toast } from '../../../model/toast';
import { ToastProvider } from './ToastProvider';

afterEach(() => {
  act(() => toast.close());
});

describe('ToastProvider', () => {
  it('화면 밖에서 띄운 알림을 보여 주고 닫기 버튼으로 닫을 수 있어야 한다', async () => {
    const user = userEvent.setup();
    render(<ToastProvider>화면</ToastProvider>);

    act(() => {
      toast.success('초대 링크를 복사했어요');
    });
    const region = screen.getByRole('region', { name: '알림' });
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
    const region = screen.getByRole('region', { name: '알림' });
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
      await within(screen.getByRole('region', { name: '알림' })).findByText('투표가 시작됐어요'),
    );
    main.remove();
  });
});
