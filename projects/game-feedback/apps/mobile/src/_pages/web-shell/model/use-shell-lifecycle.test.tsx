import { StrictMode } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';

import { act, renderHook } from '@testing-library/react';
import * as Linking from 'expo-linking';
import { afterEach, expect, it, vi } from 'vitest';

import type { IShellLifecycleOptions } from './shell-lifecycle';
import { useShellLifecycle } from './use-shell-lifecycle';

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
});

const callbacks = () => {
  return {
    openLink: vi.fn(),
    onState: vi.fn(),
    onBack: vi.fn(async () => true),
    onFallbackBack: vi.fn(),
  } satisfies IShellLifecycleOptions;
};

it('keeps OS subscriptions and pending back across callback updates while using the latest handlers', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const removeState = vi.fn();
  const removeBack = vi.fn();
  const states = vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: removeState });
  const backs = vi.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove: removeBack });
  const initial = Promise.withResolvers<string | null>();
  vi.mocked(Linking.getInitialURL).mockReturnValueOnce(initial.promise);
  const backResult = Promise.withResolvers<boolean>();
  const first = callbacks();
  first.onBack.mockReturnValueOnce(backResult.promise);
  const { rerender, unmount } = renderHook(useShellLifecycle, { initialProps: first });
  const state = states.mock.calls[0]?.[1];
  const back = backs.mock.calls[0]?.[1];
  const link = vi.mocked(Linking.addEventListener).mock.calls[0]?.[1];
  if (!state || !back || !link) throw new Error('OS listeners missing');
  act(() => {
    state('background');
    link({ url: 'gamefeedback://ko/messages' });
    back({ type: 'hardwareBackPress', timeStamp: 0 });
  });
  const latest = callbacks();
  rerender(latest);
  expect(states).toHaveBeenCalledOnce();
  expect(backs).toHaveBeenCalledOnce();
  expect(Linking.addEventListener).toHaveBeenCalledOnce();
  expect(Linking.getInitialURL).toHaveBeenCalledOnce();
  act(() => {
    state('active');
    back({ type: 'hardwareBackPress', timeStamp: 0 });
    link({ url: 'gamefeedback://ko/settings' });
  });
  expect(latest.onState).toHaveBeenCalledWith('active');
  expect(latest.openLink).toHaveBeenCalledWith('gamefeedback://ko/settings');
  expect(latest.onBack).not.toHaveBeenCalled();
  await act(async () => {
    initial.resolve('gamefeedback://ko');
    backResult.resolve(false);
  });
  expect(latest.onFallbackBack).toHaveBeenCalledOnce();
  expect(latest.openLink).toHaveBeenCalledOnce();
  act(() => back({ type: 'hardwareBackPress', timeStamp: 0 }));
  expect(latest.onBack).toHaveBeenCalledOnce();
  unmount();
  expect(removeState).toHaveBeenCalledOnce();
  expect(removeBack).toHaveBeenCalledOnce();
  act(() => {
    state('background');
    link({ url: 'gamefeedback://ko' });
    back({ type: 'hardwareBackPress', timeStamp: 0 });
  });
  expect(latest.onState).toHaveBeenCalledOnce();
  expect(latest.openLink).toHaveBeenCalledOnce();
  expect(latest.onBack).toHaveBeenCalledOnce();
});

it('discards initial links from disposed StrictMode subscriptions and after unmount', async () => {
  const stale = Promise.withResolvers<string | null>();
  const current = Promise.withResolvers<string | null>();
  vi.mocked(Linking.getInitialURL).mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
  vi.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: vi.fn() });
  const options = callbacks();
  const { unmount } = renderHook(() => useShellLifecycle(options), { wrapper: StrictMode });
  await act(async () => stale.resolve('gamefeedback://ko/messages'));
  expect(options.openLink).not.toHaveBeenCalled();
  unmount();
  await act(async () => current.resolve('gamefeedback://ko/settings'));
  expect(options.openLink).not.toHaveBeenCalled();
});
