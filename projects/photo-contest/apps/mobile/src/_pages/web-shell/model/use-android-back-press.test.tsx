import { BackHandler, Platform } from 'react-native';

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNativeRouter } from '@photo-contest/bridge/native';

import { useAndroidBackPress } from './use-android-back-press';

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});

describe('useAndroidBackPress', () => {
  it('웹 응답 대기 중 화면이 사라지면 뒤로 가거나 앱을 종료하지 않아야 한다', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const remove = vi.fn();
    const listener = vi.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
    const exit = vi.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    const router = createNativeRouter({
      allowedOrigin: 'https://contest.example',
      capabilities: {},
      send: () => {},
    });
    const goBack = vi.fn();
    const { unmount } = renderHook(() =>
      useAndroidBackPress({ router, isWebReady: () => true, canGoBack: () => true, goBack }),
    );
    act(() => {
      listener.mock.calls[0]?.[1]({ type: 'hardwareBackPress', timeStamp: Date.now() });
    });
    unmount();
    await act(async () => router.dispose());
    expect(remove).toHaveBeenCalledOnce();
    expect(goBack).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
