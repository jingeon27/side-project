import { AppState } from 'react-native';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createNativeRouter } from '@photo-contest/bridge/native';

import { useAppStateEvents } from './use-app-state-events';

vi.mock('@/features/analytics', () => ({
  ANALYTICS_EVENT: { AppForegrounded: 'app_foregrounded' },
  trackEvent: vi.fn(),
}));

describe('useAppStateEvents', () => {
  it('중복·inactive 전환을 무시하고 구독을 유지한 채 최신 라우터에 전송해야 한다', () => {
    const remove = vi.fn();
    const subscribe = vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
    const first = createNativeRouter({
      allowedOrigin: 'https://contest.example',
      capabilities: {},
      send: () => {},
    });
    const second = createNativeRouter({
      allowedOrigin: 'https://contest.example',
      capabilities: {},
      send: () => {},
    });
    const firstEmit = vi.spyOn(first, 'emit');
    const secondEmit = vi.spyOn(second, 'emit');
    const view = renderHook(({ router }) => useAppStateEvents({ router, isWebReady: () => true }), {
      initialProps: { router: first },
    });
    const onChange = subscribe.mock.calls[0]?.[1];
    if (!onChange) throw new Error('AppState listener missing');
    act(() => {
      onChange('inactive');
      onChange('active');
      onChange('background');
      onChange('background');
      onChange('active');
    });
    expect(firstEmit.mock.calls).toEqual([
      ['app.state', { state: 'background' }],
      ['app.state', { state: 'active' }],
    ]);
    view.rerender({ router: second });
    act(() => onChange('background'));
    expect(subscribe).toHaveBeenCalledOnce();
    expect(secondEmit).toHaveBeenCalledWith('app.state', { state: 'background' });
    view.unmount();
    expect(remove).toHaveBeenCalledOnce();
    act(() => onChange('active'));
    expect(secondEmit).toHaveBeenCalledOnce();
    first.dispose();
    second.dispose();
  });
});
