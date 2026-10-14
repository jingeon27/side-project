import { captureException } from '@sentry/react-native';
import { fireEvent, render, screen } from '@testing-library/react';
import { hideAsync } from 'expo-splash-screen';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from './AppErrorBoundary';

const renderError = new Error('셸 렌더 실패');

function BrokenScreen(): never {
  throw renderError;
}

describe('AppErrorBoundary', () => {
  it('렌더 오류를 잡으면 안내 화면을 보여 주고, 컴포넌트 스택과 함께 Sentry로 보내야 한다', () => {
    // React가 잡은 오류를 콘솔에도 찍는다. 테스트 출력만 조용히 한다.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenScreen />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: '문제가 생겼어요' })).toBeTruthy();
    expect(hideAsync).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(renderError, {
      contexts: { react: { componentStack: expect.stringContaining('BrokenScreen') } },
    });

    fireEvent.click(screen.getByRole('button', { name: '다시 시작' }));
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
